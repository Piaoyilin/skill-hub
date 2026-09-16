import { HomeSections } from "@/components/home-sections";
import { measureAsync } from "@/lib/diagnostics/timing";
import { getRegistryHomeData } from "@/lib/registry";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await measureAsync(
    "TOTAL render/data",
    "home page data",
    () => getRegistryHomeData(),
    { route: "/" },
  );
  return <HomeSections data={data} />;
}
