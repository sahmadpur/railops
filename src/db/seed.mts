/**
 * Idempotent seed. Safe to run on every `docker compose up`.
 *
 * Source of truth for the operation catalogue: the two route sheets in docs/ —
 * «Операции БК-Гардабани.xlsx» (sheet "v2") and «Операции Гардабани-БК.xlsx». docs/operations.md
 * prints the same lists. Steps are also editable at /admin/operations.
 */
import bcrypt from "bcryptjs";
import { and, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
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
  /** The number operators read, when it should differ from `seq`. Defaults to `seq`. */
  no?: string;
  code: string;
  station: "BK" | "GRD";
  obligation: "required" | "optional" | "conditional";
  conditionalOnSeq?: number;
  parallelWithSeq?: number;
  fields?: OperationField[];
  maintenanceEffect?: "send" | "return";
  /** Recording it ends the train's sequence; see `endedAtSeq` in src/lib/turnaround-rules.ts. */
  endsRoute?: boolean;
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
    parallelWithSeq: 2,
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
    obligation: "required",
    fields: ["wagon_count", "detach_reason"],
    label: {
      az: "Vaqonların ayrılması",
      ru: "Отцепка вагонов",
      en: "Detachment of wagons",
      ka: "ვაგონების მოხსნა",
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
    code: "preliminary_customs_inspection_gr",
    station: "GRD",
    obligation: "required",
    label: {
      az: "GR gümrük xidməti tərəfindən qatarın və sənədlərin ilkin müayinəsi",
      ru: "Предварительный осмотр поезда и документов таможенной службой GR",
      en: "Preliminary inspection of the train and documents by GR customs service",
      ka: "მატარებლისა და დოკუმენტების წინასწარი შემოწმება საქართველოს საბაჟო სამსახურის მიერ",
    },
  },
  {
    seq: 14,
    code: "technical_inspection_wagons_gardabani",
    station: "GRD",
    obligation: "required",
    label: {
      az: "Vaqonların texniki müayinəsi",
      ru: "Технический осмотр вагонов",
      en: "Technical inspection of wagons",
      ka: "ვაგონების ტექნიკური შემოწმება",
    },
  },
  {
    seq: 15,
    code: "process_documents_gardabani",
    station: "GRD",
    obligation: "required",
    label: {
      az: "Daşıma sənədlərinin dəmir yolu tərəfindən işlənməsi",
      ru: "Обработка перевозочных документов со стороны ЖД",
      en: "Processing of transport documents by the railway",
      ka: "გადაზიდვის დოკუმენტების დამუშავება რკინიგზის მიერ",
    },
  },
  {
    seq: 16,
    code: "customs_process_documents_gr",
    station: "GRD",
    obligation: "required",
    label: {
      az: "Daşıma sənədlərinin GR gümrük xidməti tərəfindən işlənməsi",
      ru: "Обработка перевозочных документов таможенной службой GR",
      en: "Processing of transport documents by GR customs service",
      ka: "გადაზიდვის დოკუმენტების დამუშავება საქართველოს საბაჟო სამსახურის მიერ",
    },
  },
  // Sheet: "если выбран то конец процессов" — a train disbanded at Gardabani goes no further, so
  // recording this closes off 18–20.
  {
    seq: 17,
    code: "disband_train_gardabani",
    station: "GRD",
    obligation: "optional",
    endsRoute: true,
    label: {
      az: "Qatarın dağıdılması",
      ru: "Расформирование поезда",
      en: "Disbanding of the train",
      ka: "მატარებლის დაშლა",
    },
  },
  {
    seq: 18,
    code: "detach_attach_wagons_gardabani",
    station: "GRD",
    obligation: "required",
    fields: ["wagon_count", "detach_reason"],
    label: {
      az: "Vaqonların ayrılması/qoşulması",
      ru: "Отцепка/прицепка вагонов",
      en: "Detachment/attachment of wagons",
      ka: "ვაგონების მოხსნა/მიბმა",
    },
  },
  {
    seq: 19,
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
    seq: 20,
    code: "departure_gardabani_2",
    station: "GRD",
    obligation: "optional",
    label: {
      az: "Qatarın Qardabanidən yola düşməsi",
      ru: "Отправление поезда из Гардабани",
      en: "Train departure from Gardabani",
      ka: "მატარებლის გასვლა გარდაბანიდან",
    },
  },
];

/** Labels the Gardabani route shares between its steps. */
const PROCESS_DOCUMENTS: Localized = {
  az: "Daşıma sənədlərinin işlənməsi",
  ru: "Обработка перевозочных документов",
  en: "Processing of transport documents",
  ka: "გადაზიდვის დოკუმენტების დამუშავება",
};
const ATTACH_LOCOMOTIVE: Localized = {
  az: "Lokomotivin bağlanması (qatar–lokomotiv əlaqəsi)",
  ru: "Привязка локомотива (логическая связка поезда с локо)",
  en: "Locomotive assignment (train–locomotive link)",
  ka: "ლოკომოტივის მიბმა (მატარებელი–ლოკომოტივი)",
};

/**
 * Gardabani → Böyük Kəsik, as «Операции Гардабани-БК.xlsx» lists it: 17 steps, its own sequence
 * rather than a mirror of the other route. Codes are the ones this route has carried since it was
 * generated from the Böyük Kəsik list, so recorded trains stay attached to their steps.
 */
const GRD_ROUTE: OpSeed[] = [
  {
    seq: 1,
    code: "grd_route_arrival_gardabani",
    station: "GRD",
    obligation: "required",
    fields: ["train_number"],
    label: {
      az: "Qardabaniyə gəliş",
      ru: "Прибытие в Гардабани",
      en: "Arrival at Gardabani",
      ka: "ჩამოსვლა გარდაბანში",
    },
  },
  {
    seq: 2,
    code: "grd_route_process_documents_gardabani",
    station: "GRD",
    obligation: "required",
    label: PROCESS_DOCUMENTS,
  },
  {
    seq: 3,
    code: "grd_route_commercial_technical_inspection_gardabani",
    station: "GRD",
    obligation: "required",
    label: {
      az: "Qatarın kommersiya və texniki müayinəsi",
      ru: "Коммерческий/Технический осмотры поезда",
      en: "Commercial and technical inspection of the train",
      ka: "მატარებლის კომერციული და ტექნიკური შემოწმება",
    },
  },
  {
    seq: 4,
    code: "grd_route_customs_document_check_gardabani",
    station: "GRD",
    obligation: "required",
    label: {
      az: "Daşıma sənədlərinin gümrük yoxlaması",
      ru: "Проверка перевозочных документов таможней",
      en: "Customs check of transport documents",
      ka: "დოკუმენტების საბაჟო შემოწმება",
    },
  },
  {
    seq: 5,
    code: "grd_route_detach_wagons_gardabani",
    station: "GRD",
    obligation: "required",
    fields: ["wagon_count", "detach_reason"],
    label: {
      az: "Vaqonların ayrılması/qoşulması",
      ru: "Отцепка/прицепка вагонов",
      en: "Detachment/attachment of wagons",
      ka: "ვაგონების მოხსნა/მიბმა",
    },
  },
  {
    seq: 6,
    code: "grd_route_attach_locomotive_gardabani",
    station: "GRD",
    obligation: "required",
    fields: ["locomotive"],
    label: ATTACH_LOCOMOTIVE,
  },
  {
    seq: 7,
    code: "grd_route_brake_test_vu45_gardabani",
    station: "GRD",
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
    code: "grd_route_departure_gardabani",
    station: "GRD",
    obligation: "required",
    label: {
      az: "Qardabanidən yola düşmə",
      ru: "Отправление из Гардабани",
      en: "Departure from Gardabani",
      ka: "გასვლა გარდაბანიდან",
    },
  },
  {
    seq: 9,
    code: "grd_route_arrival_bk",
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
    seq: 10,
    code: "grd_route_assign_train_number_az",
    station: "BK",
    obligation: "required",
    fields: ["train_number"],
    label: {
      az: "AZ qatar nömrəsinin verilməsi (tək)",
      ru: "Присвоение номера поезда AZ (нечётный)",
      en: "Assignment of AZ train number (odd)",
      ka: "AZ მატარებლის ნომრის მინიჭება (კენტი)",
    },
  },
  {
    seq: 11,
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
  {
    seq: 12,
    code: "grd_route_receive_documents_bk",
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
    seq: 13,
    code: "grd_route_customs_inspection_az",
    station: "BK",
    obligation: "required",
    label: {
      az: "AZ gümrük xidmətinin müayinəsi",
      ru: "Осмотр поезда таможенной службой AZ",
      en: "Inspection by AZ customs service",
      ka: "აზერბაიჯანის საბაჟო სამსახურის შემოწმება",
    },
  },
  {
    seq: 14,
    code: "grd_route_process_documents_bk",
    station: "BK",
    obligation: "required",
    label: PROCESS_DOCUMENTS,
  },
  {
    seq: 15,
    code: "grd_route_technical_inspection_wagons_bk",
    station: "BK",
    obligation: "optional",
    label: {
      az: "Vaqonların texniki müayinəsi (zərurət olduqda)",
      ru: "Технический осмотр вагонов (по необходимости)",
      en: "Technical inspection of wagons (if required)",
      ka: "ვაგონების ტექნიკური შემოწმება (საჭიროების შემთხვევაში)",
    },
  },
  {
    seq: 16,
    code: "grd_route_attach_locomotive_bk",
    station: "BK",
    obligation: "optional",
    fields: ["locomotive"],
    label: ATTACH_LOCOMOTIVE,
  },
  {
    seq: 17,
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
  // Only the seeded fleet: locomotives an admin or operator added (`created_by` set) are theirs.
  const retired = and(
    notInArray(
      locomotives.number,
      LOCOMOTIVES.map((l) => l.number),
    ),
    isNull(locomotives.createdBy),
  )!;
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
          endsRoute: o.endsRoute ?? false,
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
          endsRoute: sql`excluded.ends_route`,
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
