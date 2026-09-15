import { HomeSections } from "@/components/home-sections";
import { getRegistryHomeData } from "@/lib/registry";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getRegistryHomeData();
  return <HomeSections data={data} />;
}
