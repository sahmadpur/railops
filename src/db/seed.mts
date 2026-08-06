/**
 * Idempotent seed. Safe to run on every `docker compose up`.
 *
 * Source of truth for the operation catalogue: docs/Operations.xlsx.
 * Two references in that sheet are internally inconsistent (some point at sheet rows,
 * others at operation numbers), so they are seeded with the semantically correct target
 * and marked below — confirm with the operations team and edit at /admin/operations.
 */
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  locomotives,
  operationTypes,
  referenceValues,
  stations,
  trainNumbers,
  users,
  type Localized,
  type OperationField,
} from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema: { stations, users, locomotives, trainNumbers, referenceValues, operationTypes } });

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
  {
    code: "TBS",
    country: "GE",
    sortOrder: 3,
    name: { az: "Tbilisi", ru: "Тбилиси", en: "Tbilisi", ka: "თბილისი" },
  },
] satisfies { code: string; country: string; sortOrder: number; name: Localized }[];

type OpSeed = {
  seq: number;
  code: string;
  station: "BK" | "GRD" | "TBS";
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
    code: "departure_gardabani_1",
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
    seq: 18,
    code: "arrival_tbilisi",
    station: "TBS",
    obligation: "required",
    label: {
      az: "Tbilisiyə gəliş",
      ru: "Прибытие в Тбилиси",
      en: "Arrival at Tbilisi",
      ka: "ჩამოსვლა თბილისში",
    },
  },
  {
    seq: 19,
    code: "locomotive_to_maintenance_tbilisi",
    maintenanceEffect: "send",
    station: "TBS",
    obligation: "optional",
    fields: ["maintenance_reason", "maintenance_type"],
    label: {
      az: "Lokomotiv TOİR-ə göndərilib",
      ru: "Локомотив отправлен в ТОИР",
      en: "Locomotive sent to maintenance (TOIR)",
      ka: "ლოკომოტივი გაგზავნილია სარემონტო სამუშაოებზე",
    },
  },
  {
    seq: 20,
    code: "locomotive_from_maintenance_tbilisi",
    maintenanceEffect: "return",
    station: "TBS",
    obligation: "conditional",
    conditionalOnSeq: 19,
    fields: ["maintenance_type"],
    label: {
      az: "Lokomotiv TOİR-dən qaytarılıb",
      ru: "Локомотив вернулся из ТОИР",
      en: "Locomotive returned from maintenance (TOIR)",
      ka: "ლოკომოტივი დაბრუნდა სარემონტო სამუშაოებიდან",
    },
  },
  {
    seq: 21,
    code: "attach_locomotive_tbilisi",
    station: "TBS",
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
    seq: 22,
    code: "assign_train_number_gr_odd",
    station: "TBS",
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
    seq: 23,
    code: "departure_tbilisi",
    station: "TBS",
    obligation: "required",
    label: {
      az: "Tbilisidən yola düşmə",
      ru: "Отправление из Тбилиси",
      en: "Departure from Tbilisi",
      ka: "გასვლა თბილისიდან",
    },
  },
  {
    seq: 24,
    code: "arrival_gardabani_2",
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
    seq: 25,
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
    seq: 26,
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
    seq: 27,
    code: "locomotive_to_maintenance_bk",
    maintenanceEffect: "send",
    station: "BK",
    obligation: "required", // Sheet marks this one obligatory (unlike its Tbilisi twin at seq 19).
    fields: ["maintenance_reason", "maintenance_type"],
    label: {
      az: "Lokomotiv TOİR-ə göndərilib",
      ru: "Локомотив отправлен в ТОИР",
      en: "Locomotive sent to maintenance (TOIR)",
      ka: "ლოკომოტივი გაგზავნილია სარემონტო სამუშაოებზე",
    },
  },
  {
    seq: 28,
    code: "locomotive_from_maintenance_bk",
    maintenanceEffect: "return",
    station: "BK",
    obligation: "conditional",
    conditionalOnSeq: 27,
    fields: ["maintenance_type"],
    label: {
      az: "Lokomotiv TOİR-dən qaytarılıb",
      ru: "Локомотив вернулся из ТОИР",
      en: "Locomotive returned from maintenance (TOIR)",
      ka: "ლოკომოტივი დაბრუნდა სარემონტო სამუშაოებიდან",
    },
  },
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
      set: { name: sql`excluded.name`, country: sql`excluded.country`, sortOrder: sql`excluded.sort_order` },
    });

  const stationIds = new Map((await db.select().from(stations)).map((s) => [s.code, s.id]));

  await db
    .insert(operationTypes)
    .values(
      OPERATIONS.map((o) => ({
        seq: o.seq,
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
      target: operationTypes.seq,
      set: {
        code: sql`excluded.code`,
        label: sql`excluded.label`,
        stationId: sql`excluded.station_id`,
        obligation: sql`excluded.obligation`,
        conditionalOnSeq: sql`excluded.conditional_on_seq`,
        parallelWithSeq: sql`excluded.parallel_with_seq`,
        fields: sql`excluded.fields`,
        maintenanceEffect: sql`excluded.maintenance_effect`,
      },
    });

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
    await db
      .insert(locomotives)
      .values([
        { number: "VL11-001", owner: "AZ" as const, depot: "Böyük Kəsik", currentStationId: stationIds.get("BK")! },
        { number: "VL11-002", owner: "AZ" as const, depot: "Böyük Kəsik", currentStationId: stationIds.get("BK")! },
        { number: "TEM2-118", owner: "GR" as const, depot: "Gardabani", currentStationId: stationIds.get("GRD")! },
      ])
      .onConflictDoNothing({ target: locomotives.number });

    await db
      .insert(trainNumbers)
      .values([
        { number: "6001", parity: "odd" as const, country: "AZ" as const },
        { number: "6002", parity: "even" as const, country: "AZ" as const },
        { number: "4501", parity: "odd" as const, country: "GR" as const },
        { number: "4502", parity: "even" as const, country: "GR" as const },
      ])
      .onConflictDoNothing();

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
    `seeded: ${STATIONS.length} stations, ${OPERATIONS.length} operations, ${REFERENCE.length} reference values, admin ${adminEmail}`,
  );
}

await main();
await client.end();
