import type {
    Asset, ConfigModel,
    DataModel,
    Document,
    DocumentField,
    Field,
    Model,
    ObjectModel, PageModel,
    UpdateOperation,
    UpdateOperationField
} from '@stackbit/types';
import type {ExampleAsset, StrapiDocument, StrapiContentType, StrapiContentTypeSetting, StrapiDocumentFields} from './strapi-api-client';
import {StrapiComponent} from './strapi-api-client';
import {ID_SEPARATOR, stackbitCache} from './strapi-content-source';
import {FieldSpecificProps} from '@stackbit/types/src/model-fields';
import {DocumentListFieldItems} from '@stackbit/types/src/content-source-document-fields';

/**
 * Define a custom context for documents, assets, models and the complete schema.
 * This context is stored in the cache and accessible later for any need.
 */
// tslint:disable-next-line:no-empty-interface
export interface StrapiDocumentContext {
}

// tslint:disable-next-line:no-empty-interface
export interface StrapiAssetContext {
}

export interface StrapiModelContext {
    draftAndPublish: boolean;
    apiEndpoint?: string;
}

// tslint:disable-next-line:no-empty-interface
export interface StrapiSchemaContext {
}

const typeMapping: {
    // tslint:disable-next-line:max-line-length
    [key: string]: 'string' | 'number' | 'boolean' | 'url' | 'slug' | 'text' | 'markdown' | 'html' | 'date' | 'datetime' | 'color' | 'json' | 'richText'
} = {
    boolean: 'boolean',
    integer: 'number',
    string: 'string',
    richtext: 'text',
    text: 'text',
    datetime: 'datetime',
    json: 'json',
    enumeration: 'string'
};

// tslint:disable-next-line:max-line-length
export function toStackbitModels(models: (StrapiContentType | StrapiComponent)[], contentTypeSettings: StrapiContentTypeSetting[]): Model<StrapiModelContext>[] {
    return models.map((model): Model<StrapiModelContext> => {
        const contentTypeSetting = contentTypeSettings.find(cts => cts.uid === model.uid);
        return {
            type: model.uid.startsWith('api::') ? 'data' : 'object',
            name: model.apiID.replace(/-/g, '_'),
            context: {
                draftAndPublish: model.options.draftAndPublish,
                apiEndpoint: (model as StrapiContentType).info['pluralName']
            },
            labelField: contentTypeSetting?.settings?.mainField,
            fields: Object.entries(model.attributes)
                .map(([attributeName, attribute]): Field => {
                    switch (attribute.type) {
                        case 'float':
                        case 'boolean':
                        case 'string':
                        case 'richtext':
                        case 'integer':
                        case 'datetime':
                        case 'json':
                        case 'text':
                        case 'enumeration':
                            return {
                                type: typeMapping[attribute.type],
                                name: attributeName,
                                required: !!attribute.required,
                                default: attribute.default
                            };
                        case 'relation':
                            return ['oneToMany', 'manyToMany'].includes(attribute.relation)
                                ? {
                                    type: 'list',
                                    name: attributeName,
                                    items: {
                                        type: 'reference',
                                        models: [attribute.target.split('.')[1].replace(/-/g, '_')]
                                    }
                                }
                                : {
                                    type: 'reference',
                                    name: attributeName,
                                    models: [attribute.target.split('.')[1].replace(/-/g, '_')]
                                };
                        case 'component':
                            return attribute.repeatable
                                ? {
                                    type: 'list',
                                    name: attributeName,
                                    items: {
                                        type: 'model',
                                        // tslint:disable-next-line:no-non-null-assertion
                                        models: [attribute.component!.replace(/^.*\./, '').replace(/-/g, '_')]
                                    }
                                }
                                : {
                                    type: 'model',
                                    name: attributeName,
                                    // tslint:disable-next-line:no-non-null-assertion
                                    models: [attribute.component!.replace(/^.*\./, '').replace(/-/g, '_')]
                                };
                        case 'media':
                            return {
                                type: 'file',
                                name: attributeName,
                            };
                        default:
                            console.log(`Unknown attribute type: ${(attribute as any).type}`);
                            const _exhaustiveCheck: never = attribute;
                            return _exhaustiveCheck;
                    }
                })
        };
    });
}

export function toStackbitDocuments(
    documents: StrapiDocument[],
    manageUrl: string
): Document<StrapiDocumentContext>[] {
    return documents.map((document): Document<StrapiDocumentContext> => {
        const modelName = document.type.replace(/-/g, '_');
        const model = stackbitCache.getModelByName(modelName) as Model<StrapiModelContext>;
        // console.log(`Found model ${JSON.stringify(model, null, 2)} for document ${JSON.stringify(document, null, 2)}`);
        // console.log(JSON.stringify(document, null, 2));
        return {
            type: 'document',
            id: `${document.type.replace(/-/g, '_')}${ID_SEPARATOR}${document.id}`,
            modelName: modelName,
            status: model.context?.draftAndPublish
                ? document.attributes.publishedAt ? 'published' : 'added'
                : 'published',
            manageUrl: `${manageUrl}/collectionType/api::${document.type}.${document.type}/${document.id}`,
            context: {},
            createdAt: document.attributes.createdAt,
            updatedAt: document.attributes.updatedAt,
            fields: toFields(document.attributes, model)
        };
    });
}

// tslint:disable-next-line:max-line-length
function toFields(documentAttributes: StrapiDocumentFields, model: ObjectModel<StrapiModelContext> | DataModel<StrapiModelContext> | PageModel<StrapiModelContext> | ConfigModel<StrapiModelContext>): Record<string, DocumentField> {
    return Object.entries(documentAttributes)
        .filter(([_, value]) => value !== null)
        .reduce((attributes: Record<string, DocumentField>, [attributeName, attributeValue]) => {
            const modelField = model.fields?.find((field) => field.name === attributeName);
            const documentField = toDocumentField(modelField, attributeValue);
            if (documentField !== undefined) {
                attributes[attributeName] = documentField;
            }
            return attributes;
        }, {});
}

function toDocumentField(modelField: Field | undefined, attributeValue: any): DocumentField | undefined {
    if (!modelField) {
        return undefined;
    }
    switch (modelField.type) {
        case 'string':
        case 'url':
        case 'slug':
        case 'text':
        case 'markdown':
        case 'html':
        case 'boolean':
        case 'date':
        case 'datetime':
        case 'color':
        case 'number':
        case 'enum':
        case 'file':
        case 'json':
        case 'style':
        case 'richText':
            return {
                type: modelField.type,
                value: attributeValue
            };
        case 'image':
            return attributeValue
                ? {
                    type: 'reference',
                    refType: 'asset',
                    refId: attributeValue
                }
                : undefined;
        case 'reference':
            return (attributeValue && attributeValue.data) ?
                {
                    type: 'reference',
                    refType: 'document',
                    refId: `${modelField.name}${ID_SEPARATOR}${attributeValue.data.id}`
                }
                : undefined;
        case 'list':
            // console.log('list', modelField.items, attributeValue);
            // console.log(modelField.items, modelField.items.type === 'reference' ? attributeValue.data : attributeValue);
            return {
                type: 'list',
                localized: false,
                items: toDocumentListFieldItems(modelField.items, attributeValue)
            };
        case 'model':
            const modelName = modelField.models[0];
            const model = stackbitCache.getModelByName(modelName) as Model<StrapiModelContext>;
            // console.log(modelField, attributeValue, modelName, model);
            return {
                type: 'model',
                localized: false,
                modelName: modelName,
                fields: toFields(attributeValue, model)
            };
        case 'object':
        case 'cross-reference':
            throw new Error(`field of type ${modelField.type} not implemented`);
        default:
            const _exhaustiveCheck: never = modelField;
            return _exhaustiveCheck;
    }
}

function toDocumentListFieldItems(fieldSpecificProps: FieldSpecificProps, attributeValue: any[] | {
    data: any[]
}): DocumentListFieldItems[] {
    switch (fieldSpecificProps.type) {
        case 'model':
            // console.log('toDocumentListFieldItems', v, model);
            return (attributeValue as any[]).map(v => {
                const modelName = fieldSpecificProps.models[0];
                // tslint:disable-next-line:no-non-null-assertion
                const fields = toFields(v, stackbitCache.getModelByName(modelName)!);
                // console.log(fields);
                return ({
                    type: 'model',
                    localized: false,
                    modelName: modelName,
                    fields: fields
                });
            });
        case 'reference':
            // console.log('reference', stackbitCache.getModelByName(fieldSpecificProps.models[0]).name, v.id);
            return ((attributeValue as { data: any[] }).data).map(v => {
                // tslint:disable-next-line:no-non-null-assertion
                const refId = `${stackbitCache.getModelByName(fieldSpecificProps.models[0])!.name}${ID_SEPARATOR}${v.id}`;
                // console.log(refId);
                return ({
                    type: 'reference',
                    refType: 'document',
                    refId: refId
                });
            });
        case 'string':
        case 'url':
        case 'slug':
        case 'text':
        case 'markdown':
        case 'html':
        case 'number':
        case 'boolean':
        case 'date':
        case 'datetime':
        case 'color':
        case 'json':
        case 'richText':
        case 'file':
        case 'enum':
        case 'image':
        case 'object':
        case 'cross-reference':
        case 'style':
        case 'list':
            console.error(`Unhandled type ${fieldSpecificProps.type}`);
            return [];
        default:
            const _exhaustiveCheck: never = fieldSpecificProps;
            return _exhaustiveCheck;
    }
}

export function toStackbitAssets(assets: ExampleAsset[], manageUrl: string, siteLocalhost: string): Asset<StrapiAssetContext>[] {
    return assets.map((asset): Asset<StrapiAssetContext> => {
        return {
            type: 'asset',
            id: asset.id,
            createdAt: asset.createdAt,
            updatedAt: asset.updatedAt,
            status: 'published',
            manageUrl: manageUrl + '/assets/' + asset.id,
            context: {},
            fields: {
                title: {
                    type: 'string',
                    value: asset.title
                },
                file: {
                    type: 'assetFile',
                    url: siteLocalhost + asset.url,
                    dimensions: {
                        width: asset.width,
                        height: asset.height
                    }
                }
            }
        };
    });
}

export function stackbitUpdatedFieldToExampleFields(updateOperationFields: Record<string, UpdateOperationField>): Record<string, any> {
    const fields: Record<string, any> = {};
    for (const [fieldName, updateOperationField] of Object.entries(updateOperationFields)) {
        fields[fieldName] = convertUpdateOperationFieldToStrapiDocumentField(updateOperationField);
    }
    return fields;
}

export function stackbitUpdatesToStrapiFields(updateOperations: UpdateOperation[]): Record<string, any> {
    const fields: Record<string, any> = {};
    for (const operation of updateOperations) {
        if (operation.opType === 'set') {
            const {field, fieldPath} = operation;
            fields[fieldPath[0]] = convertUpdateOperationFieldToStrapiDocumentField(field);
        } else if (operation.opType === 'unset') {
            const {fieldPath, modelField} = operation;
            switch (modelField.type) {
                case 'string':
                case 'url':
                case 'slug':
                case 'text':
                case 'markdown':
                case 'html':
                case 'boolean':
                case 'date':
                case 'datetime':
                case 'color':
                case 'number':
                case 'enum':
                case 'file':
                case 'json':
                case 'style':
                case 'richText':
                case 'image':
                case 'reference':
                    fields[fieldPath[0]] = undefined;
                    break;
                case 'object':
                case 'model':
                case 'cross-reference':
                case 'list':
                    throw new Error(`updating field of type ${modelField.type} not implemented`);
                default:
                    const _exhaustiveCheck: never = modelField;
                    return _exhaustiveCheck;
            }
        } else {
            throw new Error(`'${operation.opType}' operation not implemented`);
        }
    }
    return fields;
}

function convertUpdateOperationFieldToStrapiDocumentField(updateOperationField: UpdateOperationField) {
    switch (updateOperationField.type) {
        case 'string':
        case 'url':
        case 'slug':
        case 'text':
        case 'markdown':
        case 'html':
        case 'boolean':
        case 'date':
        case 'datetime':
        case 'color':
        case 'number':
        case 'enum':
        case 'file':
        case 'json':
        case 'style':
        case 'richText':
            return updateOperationField.value;
        case 'reference':
            return updateOperationField.refId;
        case 'image':
        case 'object':
        case 'model':
        case 'cross-reference':
        case 'list':
            throw new Error(`updating field of type ${updateOperationField.type} not implemented`);
        default:
            const _exhaustiveCheck: never = updateOperationField;
            return _exhaustiveCheck;
    }
}
