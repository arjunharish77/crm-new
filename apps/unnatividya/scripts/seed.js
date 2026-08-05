const { Client } = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: ".env" });

const universities = [
  {
    id: "muj",
    slug: "manipal-university-jaipur",
    name: "Manipal University Jaipur",
    shortName: "MUJ",
    city: "Jaipur, Rajasthan",
    approvals: ["UGC-entitled", "NAAC A+", "AICTE", "WES recognised"],
    status: "DRAFT",
  },
  {
    id: "smu",
    slug: "sikkim-manipal-university",
    name: "Sikkim Manipal University",
    shortName: "SMU",
    city: "Gangtok, Sikkim",
    approvals: ["UGC-entitled", "NAAC A+", "AIU member"],
    status: "DRAFT",
  },
  {
    id: "amity",
    slug: "amity-online",
    name: "Amity Online",
    shortName: "Amity",
    city: "Noida, Uttar Pradesh",
    approvals: ["UGC-entitled", "NAAC A+", "WES recognised", "QS ranked"],
    status: "DRAFT",
  },
];

const courses = [
  ["mba-muj", "online-mba-manipal-university-jaipur", "muj", "Online MBA", "MBA", "PG", "Management", 180000, "24 months"],
  ["mba-smu", "online-mba-sikkim-manipal-university", "smu", "Online MBA", "MBA", "PG", "Management", 120000, "24 months"],
  ["mba-amity", "online-mba-amity-online", "amity", "Online MBA", "MBA", "PG", "Management", 225000, "24 months"],
  ["bba-muj", "online-bba-manipal-university-jaipur", "muj", "Online BBA", "BBA", "UG", "Management", 139500, "36 months"],
  ["bba-amity", "online-bba-amity-online", "amity", "Online BBA", "BBA", "UG", "Management", 199000, "36 months"],
  ["bba-smu", "online-bba-sikkim-manipal-university", "smu", "Online BBA", "BBA", "UG", "Management", 90000, "36 months"],
  ["bca-muj", "online-bca-manipal-university-jaipur", "muj", "Online BCA", "BCA", "UG", "IT & Computers", 139500, "36 months"],
  ["bca-amity", "online-bca-amity-online", "amity", "Online BCA", "BCA", "UG", "IT & Computers", 175000, "36 months"],
  ["mca-muj", "online-mca-manipal-university-jaipur", "muj", "Online MCA", "MCA", "PG", "IT & Computers", 158000, "24 months"],
  ["mca-amity", "online-mca-amity-online", "amity", "Online MCA", "MCA", "PG", "IT & Computers", 199000, "24 months"],
  ["mca-smu", "online-mca-sikkim-manipal-university", "smu", "Online MCA", "MCA", "PG", "IT & Computers", 110000, "24 months"],
  ["bcom-muj", "online-bcom-manipal-university-jaipur", "muj", "Online B.Com", "B.Com", "UG", "Commerce", 99000, "36 months"],
  ["bcom-smu", "online-bcom-sikkim-manipal-university", "smu", "Online B.Com", "B.Com", "UG", "Commerce", 75000, "36 months"],
  ["bcom-amity", "online-bcom-amity-online", "amity", "Online B.Com", "B.Com", "UG", "Commerce", 115000, "36 months"],
  ["mcom-muj", "online-mcom-manipal-university-jaipur", "muj", "Online M.Com", "M.Com", "PG", "Commerce", 108000, "24 months"],
  ["mcom-smu", "online-mcom-sikkim-manipal-university", "smu", "Online M.Com", "M.Com", "PG", "Commerce", 75000, "24 months"],
  ["ba-smu", "online-ba-sikkim-manipal-university", "smu", "Online BA", "BA", "UG", "Arts & Humanities", 75000, "36 months"],
  ["ma-english-smu", "online-ma-english-sikkim-manipal-university", "smu", "Online MA English", "MA English", "PG", "Arts & Humanities", 75000, "24 months"],
  ["ma-political-science-smu", "online-ma-political-science-sikkim-manipal-university", "smu", "Online MA Political Science", "MA Political Science", "PG", "Arts & Humanities", 75000, "24 months"],
  ["ma-sociology-smu", "online-ma-sociology-sikkim-manipal-university", "smu", "Online MA Sociology", "MA Sociology", "PG", "Arts & Humanities", 75000, "24 months"],
  ["ma-economics-muj", "online-ma-economics-manipal-university-jaipur", "muj", "Online MA Economics", "MA Economics", "PG", "Arts & Humanities", 80000, "24 months"],
  ["majmc-muj", "online-ma-journalism-mass-communication-manipal-university-jaipur", "muj", "Online MA JMC", "MA JMC", "PG", "Arts & Humanities", 80000, "24 months"],
  ["majmc-amity", "online-ma-journalism-mass-communication-amity-online", "amity", "Online MA (JMC)", "MA JMC", "PG", "Arts & Humanities", 130000, "24 months"],
];

async function main() {
  const connectionString =
    process.env.UNNATIVIDYA_DATABASE_URL ||
    "postgresql://unnatividya_app:unnatividya_app@localhost:5432/unnatividya";
  const client = new Client({ connectionString });
  await client.connect();

  for (const university of universities) {
    await client.query(
      `insert into university (id, slug, name, short_name, city, status, data, is_published)
       values ($1, $2, $3, $4, $5, $6, $7, false)
       on conflict (id) do update set
        slug = excluded.slug,
        name = excluded.name,
        short_name = excluded.short_name,
        city = excluded.city,
        data = excluded.data,
        updated_at = now()`,
      [
        university.id,
        university.slug,
        university.name,
        university.shortName,
        university.city,
        university.status,
        JSON.stringify({ approvals: university.approvals, source: "design_handoff_seed" }),
      ],
    );
  }

  for (const [id, slug, universityId, name, shortName, level, stream, fee, duration] of courses) {
    await client.query(
      `insert into course (id, slug, university_id, name, short_name, level, program_type, ugc_approved, stream, fee_inr, duration, status, data, is_published)
       values ($1, $2, $3, $4, $5, $6, 'DEGREE', true, $7, $8, $9, 'DRAFT', $10, false)
       on conflict (id) do update set
        slug = excluded.slug,
        university_id = excluded.university_id,
        name = excluded.name,
        short_name = excluded.short_name,
        level = excluded.level,
        stream = excluded.stream,
        fee_inr = excluded.fee_inr,
        duration = excluded.duration,
        data = excluded.data,
        updated_at = now()`,
      [
        id,
        slug,
        universityId,
        name,
        shortName,
        level,
        stream,
        fee,
        duration,
        JSON.stringify({ source: "design_handoff_seed", reviewStatus: "DRAFT" }),
      ],
    );
  }

  await client.end();
  console.log(`Seeded ${universities.length} universities and ${courses.length} courses as drafts`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
