// Official NIRF University-category results. These are institution-level results,
// not ratings of online delivery or any particular program. Update only after
// checking the named institution against the Ministry of Education tables.
export type NirfUniversityRanking = {
  institution: string;
  year: number;
  category: "University";
  result: string;
  sourceUrl: string;
  note?: string;
};

export const nirfUniversityRankings: Record<string, NirfUniversityRanking> = {
  muj: {
    institution: "Manipal University Jaipur",
    year: 2025,
    category: "University",
    result: "Rank 58",
    sourceUrl: "https://www.nirfindia.org/Rankings/2025/UniversityRanking.html",
  },
  smu: {
    institution: "Sikkim Manipal University",
    year: 2025,
    category: "University",
    result: "Rank band 151–200",
    sourceUrl: "https://www.nirfindia.org/Rankings/2025/UniversityRanking200.html",
    note: "NIRF publishes this as a band, without an individual rank.",
  },
  amity: {
    institution: "Amity University, Gautam Budh Nagar",
    year: 2025,
    category: "University",
    result: "Rank 22",
    sourceUrl: "https://www.nirfindia.org/Rankings/2025/UniversityRanking.html",
    note: "This result belongs to the named Uttar Pradesh institution. Check the awarding university for each Amity Online program separately.",
  },
};
