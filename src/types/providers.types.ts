export interface StreamProviderCapabilities {
    watchParty: boolean;
    pip: boolean;
}

export interface StreamProvider {
    id: string,
    name: string,
    enabled: boolean,
    unstable: boolean,
    url_template: string,
    requires_client_sniff: boolean,
    capabilities: StreamProviderCapabilities,
    priority: number,
    // Nullable in Postgres (`public.providers`) and in the worker's Zod schema.
    user_description: string | null,
    dev_description: string | null
}

