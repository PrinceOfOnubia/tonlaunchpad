import { Hero } from "@/components/Hero";
import { StatsBar } from "@/components/StatsBar";
import { TrendingTokens } from "@/components/TrendingTokens";
import { FeatureGrid } from "@/components/FeatureGrid";
import { CTABanner } from "@/components/CTABanner";

export default function HomePage() {
  return (
    <>
      <Hero />
      <section className="container-page -mt-8 pb-4">
        <StatsBar />
      </section>
      <TrendingTokens />
      <FeatureGrid />
      <CTABanner />
    </>
  );
}
