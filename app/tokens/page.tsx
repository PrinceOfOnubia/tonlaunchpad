import { Filters } from "@/components/Filters";
import { TokenList } from "@/components/TokenList";

export const metadata = { title: "Tokens — TonPad" };

export default function TokensPage() {
  return (
    <div className="container-page py-10 sm:py-14">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">
          All Tokens
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Discover live presales, upcoming launches, and graduated tokens
        </p>
      </div>

      <div className="mb-6">
        <Filters />
      </div>

      <TokenList />
    </div>
  );
}
