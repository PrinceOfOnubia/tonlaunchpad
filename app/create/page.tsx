import { CreateTokenForm } from "@/components/CreateTokenForm";

export const metadata = { title: "Create Token — TonPad" };

export default function CreatePage() {
  return (
    <div className="container-page py-10 sm:py-14">
      <div className="mb-8 max-w-2xl">
        <h1 className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">
          Launch your token
        </h1>
        <p className="mt-2 text-sm text-ink-500 sm:text-base">
          Configure identity, allocation, presale parameters, and buyback schedule. Your token is
          submitted in a single transaction.
        </p>
      </div>
      <CreateTokenForm />
    </div>
  );
}
