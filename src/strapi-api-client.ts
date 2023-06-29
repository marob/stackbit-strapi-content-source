export interface StrapiApiClientOptions {
    url: string;
    token: string;
    jwt: string;
}

interface ExampleData {
    models: StrapiContentType[];
    documents: StrapiDocument[];
    assets: ExampleAsset[];
}

export interface StrapiContentType {
    apiID: string;
    attributes: { [key: string]: AttributeModel };
    info: {
        description: string;
        displayName: string;
        pluralName: string;
        singularName: string;
    };
    isDisplayed: boolean;
    kind: string;
    options: any;
    pluginOptions: any;
    uid: string;
}

export interface StrapiContentTypeSetting {
    settings: {
        bulkable: boolean;
        defaultSortBy: string;
        defaultSortOrder: string;
        filterable: boolean;
        mainField: string;
        pageSize: number;
        searchable: boolean;
    };
    uid: string;
}

export interface StrapiComponent {
    apiID: string;
    attributes: { [key: string]: AttributeModel };
    category: string;
    info: {
        description: string;
        displayName: string;
    };
    isDisplayed: boolean;
    options: any;
    uid: string;
}

export type AttributeModel =
    | {
    type: 'boolean' | 'integer' | 'float' | 'string' | 'datetime' | 'json' | 'media' | 'richtext' | 'text' | 'enumeration';
    required?: boolean;
    repeatable?: boolean;
    default: any;
    customField?: string;
    options?: {
        draftAndPublish: boolean
    };
    allowedTypes?: string[];
}
    | {
    type: 'component';
    required?: boolean;
    repeatable?: boolean;
    component?: string;
}
    | {
    type: 'relation'
    relation: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany';
    relationType: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany';
    target: string;
    targetModel: string;
};

export type StrapiDocumentFields = Record<string, any>;

export interface StrapiDocument {
    id: number;
    type: string;
    /** the document's fields matching the model fields */
    attributes: StrapiDocumentFields;
}

export interface ExampleAsset {
    id: string;
    createdAt: string;
    updatedAt: string;
    url: string;
    title: string;
    width: number;
    height: number;
}

export type ExampleContentChangeEvent =
    | {
    name: 'document-created' | 'document-updated';
    document: StrapiDocument;
}
    | {
    name: 'document-deleted';
    documentId: string;
}
    | {
    name: 'asset-created';
    asset: ExampleAsset;
};

export interface ExampleWebhook {
    name: string;
}

/**
 * All ExampleApiClient methods are asynchronous to simulate a real API client.
 * All content mutation methods schedule an asynchronous event with a short
 * delay to simulate a real world use case of a headless CMS pushing the updated
 * content to CDN.
 */
export class StrapiApiClient {
    private readonly url: string;
    private readonly token: string;
    private readonly jwt: string;
    private webhooks: ExampleWebhook[] = [];
    private contentChangeObservers: {
        id: string;
        callback: (options: { observerId: string; events: ExampleContentChangeEvent[] }) => void;
    }[] = [];

    constructor(options: StrapiApiClientOptions) {
        this.url = options.url;
        this.token = options.token;
        this.jwt = options.jwt;
    }

    async getComponents(): Promise<StrapiComponent[]> {
        const components: StrapiComponent[] = await (await (await fetch(`${this.url}/content-manager/components`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.jwt}`,
                'Content-Type': 'application/json',
            }
        })).json())
            .data;
        console.log(`Components: ${components.map(m => m.apiID).join(',')}`);
        return components;
    }

    async getContentTypes(): Promise<StrapiContentType[]> {
        const contentTypes: StrapiContentType[] = await (await (await fetch(`${this.url}/content-manager/content-types`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.jwt}`,
                'Content-Type': 'application/json',
            }
        })).json())
            .data
            .filter((d: StrapiContentType) => d.uid.startsWith('api::'));
        console.log(`Content types: ${contentTypes.map(m => m.apiID).join(',')}`);
        return contentTypes;
    }

    async getContentTypeSettings(): Promise<StrapiContentTypeSetting[]> {
        return await (await (await fetch(`${this.url}/content-manager/content-types-settings`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.jwt}`,
                'Content-Type': 'application/json',
            }
        })).json())
            .data
            .filter((i: StrapiContentTypeSetting) => i.uid.startsWith('api::'));
    }

    async getDocuments(models: (StrapiContentType | StrapiComponent)[]): Promise<StrapiDocument[]> {
        console.log(`Getting documents...`);
        return (await Promise.all(
            models
                .filter(model => model.uid.startsWith('api::'))
                .map(model => {
                    return this.getDocumentsOfModel(model as StrapiContentType);
                })
        )).flat();
    }

    private async getDocumentsOfModel(model: StrapiContentType): Promise<StrapiDocument[]> {
        const documents: StrapiDocument[] = [];
        let nbPages = 1;
        for (let page = 1; page <= nbPages; page++) {
            console.log(`Downloading page ${page}/${nbPages} for ${model.info.singularName}`);
            const result = await (await fetch(`${this.url}/api/${model.info.pluralName}?pagination[pageSize]=100&pagination[page]=${page}&publicationState=preview&populate=*`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                }
            })).json();
            const items: StrapiDocument[] = await result
                .data
                .map((document: Partial<StrapiDocument>) => ({...document, type: model.apiID}));
            nbPages = result.meta.pagination.pageCount;
            documents.push(...items);
        }
        console.log(`Found ${documents.length} ${model.info.pluralName}`);
        return documents;
    }

    async getAssets(): Promise<ExampleAsset[]> {
        return [];
    }

    async createDocument(options: { type: string; fields: Record<string, any> }): Promise<StrapiDocument> {
        // const date = new Date().toISOString();
        // const document: StrapiDocument = {
        //     id: uuidv4(),
        //     type: options.type,
        //     createdAt: date,
        //     updatedAt: date,
        //     status: 'draft',
        //     fields: options.fields
        // };
        // const data = await this.loadData();
        // data.documents.push(document);
        // await this.saveData(data);
        // this.notifyObservers({
        //     events: [
        //         {
        //             name: 'document-created',
        //             document: document
        //         }
        //     ]
        // });
        // return document;
        return {} as StrapiDocument;
    }

    async updateDocument(contentType: string, id: string, fields: Record<string, any>): Promise<StrapiDocument> {
        await fetch(`${this.url}/api/${contentType}/${id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: fields
            })
        });

        // const data = await this.loadData();
        // const document = data.documents.find((document) => document.id === options.documentId);
        // if (!document) {
        //     throw new Error(`'document with id '${options.documentId}' not found`);
        // }
        // Object.assign(document.fields, options.fields, {
        //     updatedAt: new Date().toISOString(),
        //     status: 'changed'
        // });
        // await this.saveData(data);
        // this.notifyObservers({
        //     events: [
        //         {
        //             name: 'document-updated',
        //             document: document
        //         }
        //     ]
        // });
        // return document;
        return {} as StrapiDocument;
    }

    async deleteDocument(options: { documentId: string }): Promise<void> {
        // const data = await this.loadData();
        // const index = data.documents.findIndex((document) => document.id === options.documentId);
        // if (index !== -1) {
        //     data.documents.splice(index, 1);
        //     await this.saveData(data);
        //     this.notifyObservers({
        //         events: [
        //             {
        //                 name: 'document-deleted',
        //                 documentId: options.documentId
        //             }
        //         ]
        //     });
        // }
    }

    async publishDocuments(options: { documentIds: string[] }): Promise<void> {
        // const data = await this.loadData();
        // const updatedDocuments: StrapiDocument[] = [];
        // for (const documentId of options.documentIds) {
        //     const document = data.documents.find((document) => document.id === documentId);
        //     if (document) {
        //         document.status = 'published';
        //         updatedDocuments.push(document);
        //     }
        // }
        // await this.saveData(data);
        // this.notifyObservers({
        //     events: updatedDocuments.map((document) => ({
        //         name: 'document-updated',
        //         document: document
        //     }))
        // });
    }

    async uploadAsset(options: { url: string; title: string; width: number; height: number }): Promise<ExampleAsset> {
        // const date = new Date().toISOString();
        // const asset: ExampleAsset = {
        //     id: uuidv4(),
        //     createdAt: date,
        //     updatedAt: date,
        //     url: options.url,
        //     title: options.title,
        //     width: options.width,
        //     height: options.height
        // };
        // const data = await this.loadData();
        // data.assets.push(asset);
        // await this.saveData(data);
        // this.notifyObservers({
        //     events: [
        //         {
        //             name: 'asset-created',
        //             asset: asset
        //         }
        //     ]
        // });
        // return asset;
        return {} as ExampleAsset;
    }

    async startObservingContentChanges(options: {
        callback: (options: { observerId: string; events: ExampleContentChangeEvent[] }) => void
    }): Promise<string> {
        // const observerId = uuidv4();
        // this.contentChangeObservers.push({
        //     id: observerId,
        //     callback: options.callback
        // });
        // return observerId;
        return '';
    }

    async stopObservingContentChanges(options: { observerId: string }): Promise<void> {
        const index = this.contentChangeObservers.findIndex((observer) => observer.id === options.observerId);
        if (index !== -1) {
            this.contentChangeObservers.splice(index, 1);
        }
    }

    async getWebhook(options: { name: string }): Promise<ExampleWebhook | undefined> {
        return this.webhooks.find((webhook) => webhook.name === options.name);
    }

    async createWebhook(options: { name: string }): Promise<ExampleWebhook> {
        const webhook = {name: options.name};
        this.webhooks.push(webhook);
        return webhook;
    }

    private notifyObservers({delay = 200, events}: { delay?: number; events: ExampleContentChangeEvent[] }): void {
        for (const observer of this.contentChangeObservers) {
            observer.callback({
                observerId: observer.id,
                events: events
            });
        }
    }
}
