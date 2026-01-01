import { ApiKeysCard } from "@daveyplate/better-auth-ui";

export default function ApiKeys() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-8 py-6">
        <h1 className="text-2xl font-semibold text-foreground">API Keys</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your API keys for authentication
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl">
          <ApiKeysCard />
        </div>
      </div>
    </div>
  );
}
