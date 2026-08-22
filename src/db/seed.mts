/**
 * Idempotent seed. Safe to run on every `docker compose up`.
 *
 * Source of truth for the operation catalogue: docs/Operations.xlsx.
 * Two references in that sheet are internally inconsistent (some point at sheet rows,
 * others at operation numbers), so they are seeded with the semantically correct target
 * and marked below — confirm with the operations team and edit at /admin/operations.
 */
import bcrypt from "bcryptjs";
import { notInArray, sql } from "drizzle-orm";
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
  {
    code: "TBS",
    country: "GE",
    sortOrder: 3,
    name: { az: "Tbilisi", ru: "Тбилиси", en: "Tbilisi", ka: "თბილისი" },
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
] satisfies { number: string; owner: "AZ" | "GR"; depot: string; station: "BK" | "GRD" | "TBS" }[];


type OpSeed = {
  seq: number;
  /**
   * The number the sheet prints, when it differs from `seq` — the "16.1" step pushed every
   * later row's ordering key one ahead of its sheet number. Defaults to `seq`.
   */
  no?: string;
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
  {
    seq: 18,
    no: "17",
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
    seq: 19,
    no: "18",
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
    seq: 20,
    no: "19",
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
    seq: 21,
    no: "20",
    code: "locomotive_from_maintenance_tbilisi",
    maintenanceEffect: "return",
    station: "TBS",
    obligation: "conditional",
    conditionalOnSeq: 20,
    fields: ["maintenance_type"],
    label: {
      az: "Lokomotiv TOİR-dən qaytarılıb",
      ru: "Локомотив вернулся из ТОИР",
      en: "Locomotive returned from maintenance (TOIR)",
      ka: "ლოკომოტივი დაბრუნდა სარემონტო სამუშაოებიდან",
    },
  },
  {
    seq: 22,
    no: "21",
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
    seq: 23,
    no: "22",
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
    seq: 24,
    no: "23",
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
    seq: 25,
    no: "24",
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
    seq: 26,
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
    seq: 27,
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
    seq: 28,
    no: "27",
    code: "locomotive_to_maintenance_bk",
    maintenanceEffect: "send",
    station: "BK",
    obligation: "required", // Sheet marks this one obligatory (unlike its Tbilisi twin at seq 20).
    fields: ["maintenance_reason", "maintenance_type"],
    label: {
      az: "Lokomotiv TOİR-ə göndərilib",
      ru: "Локомотив отправлен в ТОИР",
      en: "Locomotive sent to maintenance (TOIR)",
      ka: "ლოკომოტივი გაგზავნილია სარემონტო სამუშაოებზე",
    },
  },
  {
    seq: 29,
    no: "28",
    code: "locomotive_from_maintenance_bk",
    maintenanceEffect: "return",
    station: "BK",
    obligation: "conditional",
    conditionalOnSeq: 28,
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
  const seeded = new Map(OPERATIONS.map((o) => [o.code, o.seq]));
  const renumbering = (await db.select().from(operationTypes)).some((row) => seeded.get(row.code) !== row.seq);

  await db.transaction(async (tx) => {
    // Parking rewrites every row, so skip it when the numbering already matches — otherwise
    // each seed run on an unchanged catalogue would write two audit entries per operation.
    if (renumbering) await tx.execute(sql`update operation_types set seq = seq + 1000 where seq < 1000`);
    await tx
      .insert(operationTypes)
      .values(
        OPERATIONS.map((o) => ({
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
    `seeded: ${STATIONS.length} stations, ${OPERATIONS.length} operations, ${LOCOMOTIVES.length} locomotives, ${REFERENCE.length} reference values, admin ${adminEmail}`,
  );
}

await main();
await client.end();
