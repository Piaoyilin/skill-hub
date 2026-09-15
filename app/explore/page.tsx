import { ExploreClient } from "@/components/explore-client";
import { listRegistryCategories, listRegistrySkills } from "@/lib/registry";

export const dynamic = "force-dynamic";

type ExplorePageProps = {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>;
};

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const params = await searchParams;
  const [skills, categories] = await Promise.all([
    listRegistrySkills(),
    listRegistryCategories(),
  ]);

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
