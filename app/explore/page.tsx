import { ExploreClient } from "@/components/explore-client";
import { measureAsync } from "@/lib/diagnostics/timing";
import { listRegistryCategories, listRegistrySkills } from "@/lib/registry";

export const dynamic = "force-dynamic";

type ExplorePageProps = {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>;
};

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const params = await searchParams;
  const [skills, categories] = await measureAsync(
    "TOTAL render/data",
    "explore page data",
    () =>
      Promise.all([
        listRegistrySkills(),
        listRegistryCategories(),
      ]),
    { route: "/explore" },
  );

  return (
    <ExploreClient
      skills={skills}
      categories={categories}
      initialQuery={params.q ?? ""}
      initialCategory={params.category ?? ""}
      initialSort={params.sort ?? "relevance"}
    />
  );
}
