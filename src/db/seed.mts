/**
 * Idempotent seed. Safe to run on every `docker compose up`.
 *
 * Source of truth for the operation catalogue: docs/Operations.xlsx.
 * Two references in that sheet are internally inconsistent (some point at sheet rows,
 * others at operation numbers), so they are seeded with the semantically correct target
 * and marked below — confirm with the operations team and edit at /admin/operations.
 */
import bcrypt from "bcryptjs";
import { and, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  locomotives,
  operationTypes,
  referenceValues,
  stations,
  users,
  type Localized,
  type OperationField,
} from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema: { stations, users, locomotives, referenceValues, operationTypes } });

const STATIONS = [
  {
    code: "BK",
    country: "AZ",
    sortOrder: 1,
    name: { az: "Böyük Kəsik", ru: "Беюк-Кясик", en: "Boyuk Kasik", ka: "ბოიუკ-კესიკი" },
  },
  {
    code: "GRD",
    country: "GE",
    sortOrder: 2,
    name: { az: "Qardabani", ru: "Гардабани", en: "Gardabani", ka: "გარდაბანი" },
  },
] satisfies { code: string; country: string; sortOrder: number; name: Localized }[];

/**
 * The real fleet. This list is authoritative: locomotives absent from it are deleted on every
 * seed run, so a fresh deploy ends up with exactly these rows and nothing left over from demos.
 */
const LOCOMOTIVES = [
  { number: "VL10-494", owner: "AZ", depot: "Gəncə", station: "BK" },
  { number: "VL10-585", owner: "AZ", depot: "Gəncə", station: "BK" },
  { number: "VL10-676", owner: "AZ", depot: "Gəncə", station: "BK" },
  { number: "VL10-1138", owner: "AZ", depot: "Gəncə", station: "BK" },
  { number: "VL10-1215", owner: "AZ", depot: "Gəncə", station: "BK" },
  { number: "VL10-1574", owner: "AZ", depot: "Gəncə", station: "BK" },
  { number: "VL10-1639", owner: "AZ", depot: "Gəncə", station: "BK" },
  { number: "VL11-456", owner: "AZ", depot: "Gəncə", station: "BK" },
  { number: "VL10-1581", owner: "AZ", depot: "Gəncə", station: "BK" },
] satisfies { number: string; owner: "AZ" | "GR"; depot: string; station: "BK" | "GRD" }[];


type OpSeed = {
  seq: number;
  /**
   * The number the sheet prints, when it differs from `seq` — the "16.1" step, and the return
   * leg, whose steps keep the sheet numbers they had when the route ran on to Tbilisi.
   * Defaults to `seq`.
   */
  no?: string;
  code: string;
  station: "BK" | "GRD";
  obligation: "required" | "optional" | "conditional";
  conditionalOnSeq?: number;
  parallelWithSeq?: number;
  fields?: OperationField[];
  maintenanceEffect?: "send" | "return";
  label: Localized;
};

const OPERATIONS: OpSeed[] = [
  {
    seq: 1,
    code: "arrival_bk",
    station: "BK",
    obligation: "required",
    fields: ["train_number"],
    label: {
      az: "Böyük Kəsikə gəliş",
      ru: "Прибытие в Беюк-Кясик",
      en: "Arrival at Boyuk Kasik",
      ka: "ჩამოსვლა ბოიუკ-კესიკში",
    },
  },
  {
    seq: 2,
    code: "receive_documents_bk",
    station: "BK",
    obligation: "required",
    label: {
      az: "Daşıma sənədlərinin alınması",
      ru: "Получение перевозочных документов",
      en: "Receipt of transport documents",
      ka: "გადაზიდვის დოკუმენტების მიღება",
    },
  },
  {
    seq: 3,
    code: "commercial_technical_inspection_bk",
    station: "BK",
    obligation: "required",
    parallelWithSeq: 2, // Sheet: "параллель с 3" — read as the document-receipt step.
    label: {
      az: "Qatarın kommersiya və texniki müayinəsi",
      ru: "Коммерческий/Технический осмотры поезда",
      en: "Commercial and technical inspection of the train",
      ka: "მატარებლის კომერციული და ტექნიკური შემოწმება",
    },
  },
  {
    seq: 4,
    code: "process_documents_bk",
    station: "BK",
    obligation: "required",
    label: {
      az: "Daşıma sənədlərinin işlənməsi",
      ru: "Обработка перевозочных документов",
      en: "Processing of transport documents",
      ka: "გადაზიდვის დოკუმენტების დამუშავება",
    },
  },
  {
    seq: 5,
    code: "customs_document_check_bk",
    station: "BK",
    obligation: "required",
    label: {
      az: "Daşıma sənədlərinin gümrük yoxlaması",
      ru: "Проверка перевозочных документов таможней",
      en: "Customs check of transport documents",
      ka: "დოკუმენტების საბაჟო შემოწმება",
    },
  },
  {
    seq: 6,
    code: "detach_wagons_bk",
    station: "BK",
    obligation: "optional",
    fields: ["detach_reason"],
    label: {
      az: "Vaqonların ayrılması (zərurət olduqda)",
      ru: "Отцепка вагонов (при необходимости)",
      en: "Detachment of wagons (if required)",
      ka: "ვაგონების მოხსნა (საჭიროების შემთხვევაში)",
    },
  },
  {
    seq: 7,
    code: "brake_test_vu45_bk",
    station: "BK",
    obligation: "required",
    label: {
      az: "Əyləclərin tam yoxlanılması və VU-45 arayışının verilməsi",
      ru: "Полное опробование тормозов и вручение справки ВУ-45",
      en: "Full brake test and issue of certificate VU-45",
      ka: "სამუხრუჭე სისტემის სრული გამოცდა და ცნობა ВУ-45-ის გადაცემა",
    },
  },
  {
    seq: 8,
    code: "customs_inspection_az",
    station: "BK",
    obligation: "required",
    label: {
      az: "Azərbaycan gümrüyünün müayinəsi",
      ru: "Осмотр таможней Az",
      en: "Inspection by AZ customs",
      ka: "აზერბაიჯანის საბაჟოს შემოწმება",
    },
  },
  {
    seq: 9,
    code: "border_inspection_az",
    station: "BK",
    obligation: "required",
    label: {
      az: "Azərbaycan sərhəd xidmətinin müayinəsi",
      ru: "Осмотр поезда пограничной службой Az",
      en: "Inspection by AZ border service",
      ka: "აზერბაიჯანის სასაზღვრო სამსახურის შემოწმება",
    },
  },
  {
    seq: 10,
    code: "attach_locomotive_bk",
    station: "BK",
    obligation: "required",
    fields: ["locomotive"],
    label: {
      az: "Lokomotivin bağlanması (qatar–lokomotiv əlaqəsi)",
      ru: "Привязка локомотива (логическая связка поезда с локо)",
      en: "Locomotive assignment (train–locomotive link)",
      ka: "ლოკომოტივის მიბმა (მატარებელი–ლოკომოტივი)",
    },
  },
  {
    seq: 11,
    code: "departure_bk",
    station: "BK",
    obligation: "required",
    label: {
      az: "Böyük Kəsikdən yola düşmə",
      ru: "Отправление из Беюк-Кясик",
      en: "Departure from Boyuk Kasik",
      ka: "გასვლა ბოიუკ-კესიკიდან",
    },
  },
  {
    seq: 12,
    code: "arrival_gardabani_1",
    station: "GRD",
    obligation: "required",
    label: {
      az: "Qardabaniyə gəliş",
      ru: "Прибытие в Гардабани",
      en: "Arrival at Gardabani",
      ka: "ჩამოსვლა გარდაბანში",
    },
  },
  {
    seq: 13,
    code: "assign_train_number_gr_even",
    station: "GRD",
    obligation: "required",
    fields: ["train_number"],
    label: {
      az: "GR qatar nömrəsinin verilməsi (cüt)",
      ru: "Присвоение номера поезда GR (чётный)",
      en: "Assignment of GR train number (even)",
      ka: "GR მატარებლის ნომრის მინიჭება (ლუწი)",
    },
  },
  {
    seq: 14,
    code: "passport_control_gr",
    station: "GRD",
    obligation: "required",
    label: {
      az: "GR sərhəd xidmətinin pasport nəzarəti",
      ru: "Паспортный контроль пограничной службы GR",
      en: "Passport control by GR border service",
      ka: "საქართველოს სასაზღვრო სამსახურის პასპორტის კონტროლი",
    },
  },
  {
    seq: 15,
    code: "customs_inspection_gr",
    station: "GRD",
    obligation: "required",
    parallelWithSeq: 14, // Sheet: "параллель с 13"; confirm whether it pairs with passport control or with arrival.
    label: {
      az: "GR gümrük xidmətinin müayinəsi",
      ru: "Осмотр поезда таможенной службой GR",
      en: "Inspection by GR customs service",
      ka: "საქართველოს საბაჟო სამსახურის შემოწმება",
    },
  },
  {
    seq: 16,
    code: "process_documents_gardabani",
    station: "GRD",
    obligation: "required",
    label: {
      az: "Daşıma sənədlərinin işlənməsi",
      ru: "Обработка перевозочных документов",
      en: "Processing of transport documents",
      ka: "გადაზიდვის დოკუმენტების დამუშავება",
    },
  },
  {
    seq: 17,
    no: "16.1",
    code: "technical_inspection_wagons_gardabani",
    station: "GRD",
    obligation: "optional",
    label: {
      az: "Vaqonların texniki müayinəsi (zərurət olduqda)",
      ru: "Технический осмотр вагонов (по необходимости)",
      en: "Technical inspection of wagons (if required)",
      ka: "ვაგონების ტექნიკური შემოწმება (საჭიროების შემთხვევაში)",
    },
  },
  // Gardabani is the turnaround point: the train that came in is worked back to Böyük Kəsik.
  // The sheet had these two return-train steps at Tbilisi (sheet 21–22); they keep its numbers.
  {
    seq: 18,
    no: "21",
    code: "attach_locomotive_gardabani",
    station: "GRD",
    obligation: "optional",
    fields: ["locomotive"],
    label: {
      az: "Lokomotivin bağlanması (qatar–lokomotiv əlaqəsi)",
      ru: "Привязка локомотива (логическая связка поезда с локо)",
      en: "Locomotive assignment (train–locomotive link)",
      ka: "ლოკომოტივის მიბმა (მატარებელი–ლოკომოტივი)",
    },
  },
  {
    seq: 19,
    no: "22",
    code: "assign_train_number_gr_odd_gardabani",
    station: "GRD",
    obligation: "required",
    fields: ["train_number"],
    label: {
      az: "GR qatar nömrəsinin verilməsi (tək)",
      ru: "Присвоение номера поезда GR (нечётный)",
      en: "Assignment of GR train number (odd)",
      ka: "GR მატარებლის ნომრის მინიჭება (კენტი)",
    },
  },
  {
    seq: 20,
    no: "25",
    code: "departure_gardabani_2",
    station: "GRD",
    obligation: "required",
    label: {
      az: "Qatarın Qardabanidən yola düşməsi",
      ru: "Отправление поезда из Гардабани",
      en: "Train departure from Gardabani",
      ka: "მატარებლის გასვლა გარდაბანიდან",
    },
  },
  {
    seq: 21,
    no: "26",
    code: "arrival_bk_return",
    station: "BK",
    obligation: "required",
    label: {
      az: "Böyük Kəsikə gəliş",
      ru: "Прибытие в Беюк-Кясик",
      en: "Arrival at Boyuk Kasik",
      ka: "ჩამოსვლა ბოიუკ-კესიკში",
    },
  },
  {
    seq: 22,
    no: "27",
    code: "locomotive_to_maintenance_bk",
    maintenanceEffect: "send",
    station: "BK",
    obligation: "required", // Sheet marks this one obligatory.
    fields: ["maintenance_reason", "maintenance_type"],
    label: {
      az: "Lokomotiv TOİR-ə göndərilib",
      ru: "Локомотив отправлен в ТОИР",
      en: "Locomotive sent to maintenance (TOIR)",
      ka: "ლოკომოტივი გაგზავნილია სარემონტო სამუშაოებზე",
    },
  },
  {
    seq: 23,
    no: "28",
    code: "locomotive_from_maintenance_bk",
    maintenanceEffect: "return",
    station: "BK",
    obligation: "conditional",
    conditionalOnSeq: 22,
    fields: ["maintenance_type"],
    label: {
      az: "Lokomotiv TOİR-dən qaytarılıb",
      ru: "Локомотив вернулся из ТОИР",
      en: "Locomotive returned from maintenance (TOIR)",
      ka: "ლოკომოტივი დაბრუნდა სარემონტო სამუშაოებიდან",
    },
  },
];

/** Wording shared with the Böyük Kəsik route, so the two never drift apart. */
const labelOf = (code: string): Localized => {
  const found = OPERATIONS.find((o) => o.code === code);
  if (!found) throw new Error(`no operation ${code}`);
  return found.label;
};

/**
 * The Gardabani route: the Böyük Kəsik sequence mirrored, for a train that starts its turnaround
 * at Gardabani — Gardabani → Böyük Kəsik → Gardabani. docs/Operations.xlsx only describes the
 * Böyük Kəsik direction, so this is drafted from it step for step (each border/customs step at
 * the other side's authorities, the train renumbered for Azerbaijan at Böyük Kəsik) and is
 * numbered 1–23 straight through. Confirm it with the operations team; the wording, station,
 * obligation and links are editable at /admin/operations.
 */
const GRD_ROUTE: OpSeed[] = [
  { seq: 1, code: "grd_route_arrival_gardabani", station: "GRD", obligation: "required", fields: ["train_number"], label: labelOf("arrival_gardabani_1") },
  { seq: 2, code: "grd_route_receive_documents_gardabani", station: "GRD", obligation: "required", label: labelOf("receive_documents_bk") },
  { seq: 3, code: "grd_route_commercial_technical_inspection_gardabani", station: "GRD", obligation: "required", parallelWithSeq: 2, label: labelOf("commercial_technical_inspection_bk") },
  { seq: 4, code: "grd_route_process_documents_gardabani", station: "GRD", obligation: "required", label: labelOf("process_documents_bk") },
  { seq: 5, code: "grd_route_customs_document_check_gardabani", station: "GRD", obligation: "required", label: labelOf("customs_document_check_bk") },
  { seq: 6, code: "grd_route_detach_wagons_gardabani", station: "GRD", obligation: "optional", fields: ["detach_reason"], label: labelOf("detach_wagons_bk") },
  { seq: 7, code: "grd_route_brake_test_vu45_gardabani", station: "GRD", obligation: "required", label: labelOf("brake_test_vu45_bk") },
  { seq: 8, code: "grd_route_customs_inspection_gr", station: "GRD", obligation: "required", label: labelOf("customs_inspection_gr") },
  {
    seq: 9,
    code: "grd_route_border_inspection_gr",
    station: "GRD",
    obligation: "required",
    label: {
      az: "GR sərhəd xidmətinin müayinəsi",
      ru: "Осмотр поезда пограничной службой GR",
      en: "Inspection by GR border service",
      ka: "საქართველოს სასაზღვრო სამსახურის შემოწმება",
    },
  },
  { seq: 10, code: "grd_route_attach_locomotive_gardabani", station: "GRD", obligation: "required", fields: ["locomotive"], label: labelOf("attach_locomotive_bk") },
  { seq: 11, code: "grd_route_departure_gardabani", station: "GRD", obligation: "required", label: labelOf("departure_gardabani_2") },
  { seq: 12, code: "grd_route_arrival_bk", station: "BK", obligation: "required", label: labelOf("arrival_bk") },
  {
    seq: 13,
    code: "grd_route_assign_train_number_az",
    station: "BK",
    obligation: "required",
    fields: ["train_number"],
    label: {
      az: "AZ qatar nömrəsinin verilməsi",
      ru: "Присвоение номера поезда AZ",
      en: "Assignment of AZ train number",
      ka: "AZ მატარებლის ნომრის მინიჭება",
    },
  },
  {
    seq: 14,
    code: "grd_route_passport_control_az",
    station: "BK",
    obligation: "required",
    label: {
      az: "AZ sərhəd xidmətinin pasport nəzarəti",
      ru: "Паспортный контроль пограничной службы AZ",
      en: "Passport control by AZ border service",
      ka: "აზერბაიჯანის სასაზღვრო სამსახურის პასპორტის კონტროლი",
    },
  },
  { seq: 15, code: "grd_route_customs_inspection_az", station: "BK", obligation: "required", parallelWithSeq: 14, label: labelOf("customs_inspection_az") },
  { seq: 16, code: "grd_route_process_documents_bk", station: "BK", obligation: "required", label: labelOf("process_documents_bk") },
  { seq: 17, code: "grd_route_technical_inspection_wagons_bk", station: "BK", obligation: "optional", label: labelOf("technical_inspection_wagons_gardabani") },
  // Böyük Kəsik is the turnaround point. The sheet's own turnaround station (Tbilisi, sheet
  // 19–22) gives the pattern: optional ТОИР, the return required once sent, an optional
  // locomotive change, the return train's number, departure.
  {
    seq: 18,
    code: "grd_route_locomotive_to_maintenance_bk",
    maintenanceEffect: "send",
    station: "BK",
    obligation: "optional",
    fields: ["maintenance_reason", "maintenance_type"],
    label: labelOf("locomotive_to_maintenance_bk"),
  },
  {
    seq: 19,
    code: "grd_route_locomotive_from_maintenance_bk",
    maintenanceEffect: "return",
    station: "BK",
    obligation: "conditional",
    conditionalOnSeq: 18,
    fields: ["maintenance_type"],
    label: labelOf("locomotive_from_maintenance_bk"),
  },
  { seq: 20, code: "grd_route_attach_locomotive_bk", station: "BK", obligation: "optional", fields: ["locomotive"], label: labelOf("attach_locomotive_gardabani") },
  {
    seq: 21,
    code: "grd_route_assign_train_number_az_return",
    station: "BK",
    obligation: "required",
    fields: ["train_number"],
    label: {
      az: "AZ qatar nömrəsinin verilməsi (geri)",
      ru: "Присвоение номера поезда AZ (обратный)",
      en: "Assignment of AZ train number (return)",
      ka: "AZ მატარებლის ნომრის მინიჭება (დაბრუნება)",
    },
  },
  {
    seq: 22,
    code: "grd_route_departure_bk_2",
    station: "BK",
    obligation: "required",
    label: {
      az: "Qatarın Böyük Kəsikdən yola düşməsi",
      ru: "Отправление поезда из Беюк-Кясик",
      en: "Train departure from Boyuk Kasik",
      ka: "მატარებლის გასვლა ბოიუკ-კესიკიდან",
    },
  },
  { seq: 23, code: "grd_route_arrival_gardabani_return", station: "GRD", obligation: "required", label: labelOf("arrival_gardabani_1") },
];

/** Both routes, tagged. `code` is unique across them; `seq` only within a route. */
const CATALOGUE: (OpSeed & { route: "BK" | "GRD" })[] = [
  ...OPERATIONS.map((o) => ({ ...o, route: "BK" as const })),
  ...GRD_ROUTE.map((o) => ({ ...o, route: "GRD" as const })),
];

const REFERENCE: { kind: string; code: string; label: Localized }[] = [
  { kind: "maintenance_type", code: "TO1", label: { az: "TO-1", ru: "ТО-1", en: "TO-1", ka: "TO-1" } },
  { kind: "maintenance_type", code: "TO2", label: { az: "TO-2", ru: "ТО-2", en: "TO-2", ka: "TO-2" } },
  { kind: "maintenance_type", code: "TO3", label: { az: "TO-3", ru: "ТО-3", en: "TO-3", ka: "TO-3" } },
  { kind: "maintenance_type", code: "TR1", label: { az: "TR-1", ru: "ТР-1", en: "TR-1", ka: "TR-1" } },
  { kind: "maintenance_type", code: "TR3", label: { az: "TR-3", ru: "ТР-3", en: "TR-3", ka: "TR-3" } },

  {
    kind: "maintenance_reason",
    code: "scheduled",
    label: { az: "Planlı baxış", ru: "Плановое обслуживание", en: "Scheduled maintenance", ka: "გეგმიური მომსახურება" },
  },
  {
    kind: "maintenance_reason",
    code: "malfunction",
    label: { az: "Nasazlıq", ru: "Неисправность", en: "Malfunction", ka: "გაუმართაობა" },
  },
  {
    kind: "maintenance_reason",
    code: "other",
    label: { az: "Digər", ru: "Другое", en: "Other", ka: "სხვა" },
  },

  {
    kind: "detach_reason",
    code: "technical",
    label: { az: "Texniki nasazlıq", ru: "Техническая неисправность", en: "Technical fault", ka: "ტექნიკური ხარვეზი" },
  },
  {
    kind: "detach_reason",
    code: "commercial",
    label: {
      az: "Kommersiya nasazlığı",
      ru: "Коммерческая неисправность",
      en: "Commercial fault",
      ka: "კომერციული ხარვეზი",
    },
  },
  {
    kind: "detach_reason",
    code: "customs",
    label: { az: "Gümrüyün tələbi", ru: "Требование таможни", en: "Customs requirement", ka: "საბაჟოს მოთხოვნა" },
  },
  {
    kind: "detach_reason",
    code: "other",
    label: { az: "Digər", ru: "Другое", en: "Other", ka: "სხვა" },
  },

  // ponytail: placeholder lifecycle. Replace with the operations team's official list — rows only, no schema change.
  { kind: "turnaround_status", code: "open", label: { az: "Açıq", ru: "Открыт", en: "Open", ka: "ღია" } },
  {
    kind: "turnaround_status",
    code: "in_progress",
    label: { az: "Davam edir", ru: "В работе", en: "In progress", ka: "მიმდინარე" },
  },
  {
    kind: "turnaround_status",
    code: "completed",
    label: { az: "Tamamlandı", ru: "Завершён", en: "Completed", ka: "დასრულებული" },
  },
  {
    kind: "turnaround_status",
    code: "cancelled",
    label: { az: "Ləğv edildi", ru: "Отменён", en: "Cancelled", ka: "გაუქმებული" },
  },
];

async function main() {
  // Seed writes are attributed to the system, not a user.
  await db.execute(sql`select set_config('railops.actor_id', '', true)`);

  await db
    .insert(stations)
    .values(STATIONS)
    .onConflictDoUpdate({
      target: stations.code,
      set: {
        name: sql`excluded.name`,
        country: sql`excluded.country`,
        sortOrder: sql`excluded.sort_order`,
        isActive: true,
      },
    });

  const stationIds = new Map((await db.select().from(stations)).map((s) => [s.code, s.id]));

  await db
    .insert(locomotives)
    .values(
      LOCOMOTIVES.map((l) => ({
        number: l.number,
        owner: l.owner,
        depot: l.depot,
        currentStationId: stationIds.get(l.station)!,
      })),
    )
    .onConflictDoUpdate({
      // currentStationId is left alone on conflict: it tracks where the locomotive actually is,
      // and re-seeding must not teleport a working locomotive back to its starting station.
      target: locomotives.number,
      set: { owner: sql`excluded.owner`, depot: sql`excluded.depot`, isActive: true },
    });

  // Retire everything not on the list. Rows already referenced by recorded work cannot be
  // deleted without destroying history, so those are deactivated instead — they disappear from
  // every picker but stay readable on the turnarounds that used them. On a fresh database
  // nothing is referenced, so this deletes outright and the fleet is exactly the list above.
  const retired = notInArray(
    locomotives.number,
    LOCOMOTIVES.map((l) => l.number),
  );
  await db.update(locomotives).set({ isActive: false }).where(retired);
  await db.delete(locomotives).where(
    sql`${retired}
      and not exists (select 1 from turnarounds t where t.locomotive_id = ${locomotives.id})
      and not exists (select 1 from turnaround_operations o where o.locomotive_id = ${locomotives.id})
      and not exists (select 1 from maintenance_records m where m.locomotive_id = ${locomotives.id})`,
  );


  // Inserting a step mid-sequence renumbers everything after it. `seq` is unique, so park the
  // existing numbers out of range first — otherwise the upsert collides with the row that still
  // holds the number being moved into. Identity travels with `code`, which is what the recorded
  // operations point at through the row id, so history keeps its labels.
  // One transaction: a failure between the two statements would otherwise leave the catalogue
  // parked at 1001+ and the sequence numbers meaningless.
  const seeded = new Map(CATALOGUE.map((o) => [o.code, `${o.route}:${o.seq}`]));
  const existing = await db.select().from(operationTypes);
  const renumbering = existing.some((row) => seeded.has(row.code) && seeded.get(row.code) !== `${row.route}:${row.seq}`);
  // Steps that left the route. Same rule as the fleet: deactivated where recorded work still
  // points at them, deleted outright where nothing does.
  const retiredSteps = notInArray(operationTypes.code, [...seeded.keys()]);

  await db.transaction(async (tx) => {
    // A retired step keeps its row but gives up its place: its number moves far out of range,
    // clear of both the live sequence and the parking band below. Already-retired rows are
    // skipped so re-running the seed writes nothing.
    await tx
      .update(operationTypes)
      .set({
        isActive: false,
        seq: sql`10000 + ${operationTypes.id}`,
        conditionalOnSeq: null,
        parallelWithSeq: null,
      })
      .where(and(retiredSteps, lt(operationTypes.seq, 10000)));
    await tx
      .delete(operationTypes)
      .where(
        sql`${retiredSteps} and not exists (select 1 from turnaround_operations o where o.operation_type_id = ${operationTypes.id})`,
      );

    // Parking rewrites every row, so skip it when the numbering already matches — otherwise
    // each seed run on an unchanged catalogue would write two audit entries per operation.
    if (renumbering) await tx.execute(sql`update operation_types set seq = seq + 1000 where seq < 1000`);
    await tx
      .insert(operationTypes)
      .values(
        CATALOGUE.map((o) => ({
          route: o.route,
          seq: o.seq,
          displayNo: o.no ?? String(o.seq),
          code: o.code,
          label: o.label,
          stationId: stationIds.get(o.station)!,
          obligation: o.obligation,
          conditionalOnSeq: o.conditionalOnSeq ?? null,
          parallelWithSeq: o.parallelWithSeq ?? null,
          fields: o.fields ?? [],
          maintenanceEffect: o.maintenanceEffect ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: operationTypes.code,
        set: {
          route: sql`excluded.route`,
          seq: sql`excluded.seq`,
          displayNo: sql`excluded.display_no`,
          label: sql`excluded.label`,
          stationId: sql`excluded.station_id`,
          obligation: sql`excluded.obligation`,
          conditionalOnSeq: sql`excluded.conditional_on_seq`,
          parallelWithSeq: sql`excluded.parallel_with_seq`,
          fields: sql`excluded.fields`,
          maintenanceEffect: sql`excluded.maintenance_effect`,
        },
      });
  });

  // Stations that left the route go the same way, once their steps are retired above. Their
  // operators can no longer record anything, so those accounts are switched off, and a
  // locomotive parked there is left without a station rather than at one nobody can pick.
  const retiredStations = notInArray(
    stations.code,
    STATIONS.map((s) => s.code),
  );
  const retiredStationIds = db.select({ id: stations.id }).from(stations).where(retiredStations);
  await db
    .update(users)
    .set({ isActive: false })
    .where(and(inArray(users.stationId, retiredStationIds), eq(users.isActive, true)));
  await db
    .update(locomotives)
    .set({ currentStationId: null })
    .where(inArray(locomotives.currentStationId, retiredStationIds));
  await db
    .update(stations)
    .set({ isActive: false })
    .where(and(retiredStations, eq(stations.isActive, true)));
  await db.delete(stations).where(
    sql`${retiredStations}
      and not exists (select 1 from operation_types o where o.station_id = ${stations.id})
      and not exists (select 1 from users u where u.station_id = ${stations.id})`,
  );

  await db
    .insert(referenceValues)
    .values(REFERENCE.map((r, i) => ({ ...r, sortOrder: i })))
    .onConflictDoUpdate({
      target: [referenceValues.kind, referenceValues.code],
      set: { label: sql`excluded.label`, sortOrder: sql`excluded.sort_order` },
    });

  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@ady.az").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "railops";
  await db
    .insert(users)
    .values({
      email: adminEmail,
      fullName: "System Administrator",
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "admin",
      stationId: null,
    })
    .onConflictDoNothing({ target: users.email });

  if (process.env.SEED_DEMO === "1") {
    for (const st of STATIONS) {
      await db
        .insert(users)
        .values({
          email: `operator.${st.code.toLowerCase()}@ady.az`,
          fullName: `Operator ${st.name.en}`,
          passwordHash: await bcrypt.hash("railops", 10),
          role: "operator",
          stationId: stationIds.get(st.code)!,
        })
        .onConflictDoNothing({ target: users.email });
    }
  }

  console.log(
    `seeded: ${STATIONS.length} stations, ${OPERATIONS.length}+${GRD_ROUTE.length} operations, ${LOCOMOTIVES.length} locomotives, ${REFERENCE.length} reference values, admin ${adminEmail}`,
  );
}

await main();
await client.end();
