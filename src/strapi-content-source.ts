import type {
    Asset,
    Cache,
    ContentChangeEvent,
    ContentSourceInterface,
    Document,
    InitOptions,
    Locale,
    Logger,
    Model,
    Schema,
    UpdateOperation,
    UpdateOperationField,
    User,
    ValidationError,
    Version
} from '@stackbit/types';

import {
    stackbitUpdatedFieldToExampleFields,
    stackbitUpdatesToStrapiFields,
    StrapiAssetContext,
    StrapiDocumentContext,
    StrapiModelContext,
    StrapiSchemaContext,
    toStackbitAssets,
    toStackbitDocuments,
    toStackbitModels
} from './strapi-source-utils';
import {StrapiApiClient, StrapiComponent, StrapiContentType} from './strapi-api-client';

export const ID_SEPARATOR = `#`;

/**
 * Define user-specific context properties like user-specific OAuth accessToken.
 * To use UserContext, an OAuth integration between the underlying
 * content source and Stackbit is required.
 * Please reach out to the Stackbit team for more info.
 */
// tslint:disable-next-line:no-empty-interface
export interface ExampleUserContext {
}

/**
 * Define the constructor options of your content source module.
 * Use it to define things like the project identifier in the underlying content
 * source, service-level access keys, and other data needed to read/write data
 * from/to the underlying content source.
 */
export interface ContentSourceOptions {
    url?: string;
    token: string;
    jwt: string;
}

export let stackbitCache!: Cache<StrapiSchemaContext, StrapiDocumentContext, StrapiAssetContext, StrapiModelContext>;

/**
 * @implements ContentSourceInterface
 */
// tslint:disable-next-line:max-line-length
export class StrapiContentSource implements ContentSourceInterface<ExampleUserContext, StrapiSchemaContext, StrapiDocumentContext, StrapiAssetContext, StrapiModelContext> {
    private readonly strapiUrl: string;
    private readonly token: string;
    private readonly jwt: string;
    private readonly manageUrl: string;
    private logger!: Logger;
    private userLogger!: Logger;
    private localDev!: boolean;
    private apiClient!: StrapiApiClient;
    private observerId?: string;
    private strapiModels?: (StrapiContentType | StrapiComponent)[];

    constructor({url, token, jwt}: ContentSourceOptions) {
        if (!token) {
            throw new Error('StrapiContentSource requires token');
        }
        if (!jwt) {
            throw new Error('StrapiContentSource requires jwt');
        }
        this.jwt = jwt;
        this.token = token;
        this.strapiUrl = url ?? 'http://localhost:1337';
        this.manageUrl = `${this.strapiUrl}/admin/content-manager`;
    }

    getContentSourceType(): string {
        return 'strapi';
    }

    getProjectId(): string {
        return this.strapiUrl;
    }

    async init({
                   logger,
                   userLogger,
                   localDev,
                   webhookUrl,
                   cache
               }: InitOptions<StrapiSchemaContext, StrapiDocumentContext, StrapiAssetContext, StrapiModelContext>): Promise<void> {
        stackbitCache = cache;
        this.apiClient = new StrapiApiClient({
            url: this.strapiUrl,
            token: this.token,
            jwt: this.jwt,
        });
        this.localDev = localDev;

        // Create new loggers with a custom label. That label will be prepended to log messages.
        this.logger = logger.createLogger({label: 'strapi-content-source'});
        this.userLogger = userLogger.createLogger({label: 'strapi-content-source'});

        await this.initWebhook(webhookUrl);
        this.logger.info(`initialized content source`);
    }

    async getVersion(): Promise<Version> {
        return {interfaceVersion: '0.7.3', contentSourceVersion: '0.1'};
    }

    async getSchema(): Promise<Schema<StrapiSchemaContext, StrapiModelContext>> {
        const models = await this.getModels();
        const locales = this.getLocales();
        return {
            context: {},
            models,
            locales
        };
    }

    async getDocuments(): Promise<Document<StrapiDocumentContext>[]> {
        // tslint:disable-next-line:no-non-null-assertion
        return toStackbitDocuments(await this.apiClient.getDocuments(this.strapiModels!), this.manageUrl);
    }

    async getAssets(): Promise<Asset<StrapiAssetContext>[]> {
        const assets = await this.apiClient.getAssets();
        return toStackbitAssets(assets, this.manageUrl, this.strapiUrl);
    }

    getProjectManageUrl(): string {
        return this.manageUrl;
    }

    async startWatchingContentUpdates() {
        if (this.observerId) {
            await this.stopWatchingContentUpdates();
        }
        this.observerId = await this.apiClient.startObservingContentChanges({
            callback: ({events}) => {
                this.logger.info(`got events: ${JSON.stringify(events, null, 2)}`);
                const contentChanges: ContentChangeEvent<StrapiDocumentContext, StrapiAssetContext> = {
                    documents: [],
                    assets: [],
                    deletedDocumentIds: [],
                    deletedAssetIds: [],
                    scheduledActions: [],
                    deletedScheduledActionIds: []
                };
                for (const event of events) {
                    if (event.name === 'document-created' || event.name === 'document-updated') {
                        const createdDocument = toStackbitDocuments([event.document], this.manageUrl)[0];
                        contentChanges.documents.push(createdDocument);
                    } else if (event.name === 'document-deleted') {
                        contentChanges.deletedDocumentIds.push(event.documentId);
                    } else if (event.name === 'asset-created') {
                        const createdAsset = toStackbitAssets([event.asset], this.manageUrl, this.strapiUrl)[0];
                        contentChanges.assets.push(createdAsset);
                    }
                }
                stackbitCache.updateContent(contentChanges);
            }
        });
    }

    getProjectEnvironment(): string {
        return 'main';
    }

    /**
     * Setup webhooks between the underlying content source and Stackbit.
     *
     * The webhookUrl is provided in Stackbit Cloud only (localDev === false).
     * To debug webhooks, run `stackbit dev` with the `--csi-webhook-url=...` parameter.
     * Use services such as Ngrok to tunnel webhooks to your local machine.
     *
     * Note: to avoid creating another webhook in your content source each time the content source
     * is initialized, check first if a webhook already exists.
     * @param webhookUrl
     */
    private async initWebhook(webhookUrl: string | undefined) {
        if (webhookUrl) {
            this.logger.info(`checking if stackbit webhook exists`);
            let webhook = await this.apiClient.getWebhook({name: 'stackbit-content-source'});
            if (!webhook) {
                this.logger.info(`no webhook 'stackbit-content-source' was found, creating a new webhook`);
                const newWebhook = await this.apiClient.createWebhook({name: 'stackbit-content-source'});
                if (newWebhook) {
                    webhook = newWebhook;
                }
            }
            if (webhook) {
                this.logger.info('got a stackbit-content-source webhook');
            }
        }
    }

    async stopWatchingContentUpdates(): Promise<void> {
        if (this.observerId) {
            await this.apiClient.stopObservingContentChanges({
                observerId: this.observerId
            });
        }
    }

    private async getModels(): Promise<Model<StrapiModelContext>[]> {
        this.strapiModels = [...await this.apiClient.getComponents(), ...await this.apiClient.getContentTypes()];
        const contentTypeSettings = await this.apiClient.getContentTypeSettings();
        return toStackbitModels(this.strapiModels, contentTypeSettings);
    }

    private getLocales(): Locale[] {
        return []; // No multiple locales in this example
    }

    async hasAccess(options: { userContext?: ExampleUserContext }): Promise<{
        hasConnection: boolean;
        hasPermissions: boolean;
    }> {
        if (this.localDev) {
            return {hasConnection: true, hasPermissions: true};
        }
        // Use userContext.accessToken to check if user has write access to this content source
        /*
        if (!options?.userContext?.accessToken) {
            return { hasConnection: false, hasPermissions: false };
        }
        const hasAccess = this.apiClient.hasAccess({
            accessToken: options?.userContext?.accessToken;
        })
        return {
            hasConnection: true,
            hasPermissions: hasAccess
        };
         */
        return {hasConnection: true, hasPermissions: true};
    }

    async createDocument(options: {
        updateOperationFields: Record<string, UpdateOperationField>;
        model: Model<StrapiModelContext>;
        locale?: string;
        defaultLocaleDocumentId?: string;
        userContext?: User<ExampleUserContext>;
    }): Promise<{
        documentId: string;
    }> {
        const fields = stackbitUpdatedFieldToExampleFields(options.updateOperationFields);
        const document = await this.apiClient.createDocument({type: options.model.name, fields});
        this.logger.info(`created document, id: ${document.id}`);
        return {
            documentId: toStackbitDocuments([document], this.manageUrl)[0].id
        };
    }

    async updateDocument(options: {
        document: Document<StrapiDocumentContext>;
        operations: UpdateOperation[];
        userContext?: User<ExampleUserContext>;
    }): Promise<void> {
        const fields = stackbitUpdatesToStrapiFields(options.operations);
        const [contentType, id] = options.document.id.split(ID_SEPARATOR);
        const model = stackbitCache.getModelByName(contentType);
        // tslint:disable-next-line:no-non-null-assertion
        await this.apiClient.updateDocument(model!.context!.apiEndpoint!, id, fields);
    }

    async deleteDocument(options: { document: Document<StrapiDocumentContext>; userContext?: ExampleUserContext }): Promise<void> {
        await this.apiClient.deleteDocument({
            documentId: options.document.id
        });
    }

    async uploadAsset(options: {
        url?: string;
        base64?: string;
        fileName: string;
        mimeType: string;
        locale?: string;
        userContext?: ExampleUserContext;
    }): Promise<Asset<StrapiAssetContext>> {
        if (!options.url) {
            throw new Error('uploading assets from base64 is not supported');
        }

        const asset = await this.apiClient.uploadAsset({
            url: options.url,
            title: options.fileName,
            width: 100,
            height: 100
        });
        return toStackbitAssets([asset], this.manageUrl, this.strapiUrl)[0];
    }

    async validateDocuments(options: {
        documents: Document<StrapiDocumentContext>[];
        assets: Asset<StrapiAssetContext>[];
        locale?: string;
        userContext?: ExampleUserContext;
    }): Promise<{ errors: ValidationError[] }> {
        return {errors: []};
    }

    async publishDocuments(options: {
        documents: Document<StrapiDocumentContext>[];
        assets: Asset<StrapiAssetContext>[];
        userContext?: ExampleUserContext;
    }): Promise<void> {
        await this.apiClient.publishDocuments({
            documentIds: options.documents.map((document) => document.id)
        });
    }

    async onWebhook(data: { data: any; headers: Record<string, string> }): Promise<void> {
        return;
    }

    async reset(): Promise<void> {
        return;
    }

    async destroy(): Promise<void> {
        return;
    }
}
