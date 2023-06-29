# Strapi content source for Stackbit

This is a POC of a [Strapi](https://strapi.io/) [Content Source Interface](https://docs.stackbit.com/reference/content-sources) for [Stackbit](https://www.stackbit.com/)

This Content Source Interface is based on the [example content source](https://github.com/stackbit-themes/stackbit-examples/tree/main/custom-content-source/example-content-source) provided by Stackbit.

## Usage

In `stackbit.config.js` file:

```javascript
import {StrapiContentSource} from 'stackbit-strapi-content-source';

const config = {
    stackbitVersion: '~0.6.0',
    ssgName: '...',
    nodeVersion: '16',
    contentSources: [
        new StrapiContentSource({
            url: process.env.STRAPI_URL,
            token: process.env.STRAPI_TOKEN,
            jwt: process.env.STRAPI_JWT,
        }),
    ],
};

export default config;
```

In `.env` file:

```
STRAPI_URL=http://127.0.0.1:1337
STRAPI_TOKEN=...
STRAPI_JWT=...
```

With:
- `STRAPI_TOKEN`: a token created in `Settings > API Tokens` in Strapi. It is used to read/write on the Strapi API
-  `STRAPI_JWT`: a JWT that you can get when logged in to Strapi admin by executing the following script in the browser console: `JSON.parse(sessionStorage.jwtToken || localStorage.jwtToken)`. This is used to read the "content-manager" API that is required to discover Strapi model

## Available features

- load Strapi schema
- load Strapi documents
- link Strapi document to Strapi content manager edit page
- updating a document field (only setting a new value)
- most content types mappings (basic types, relations, repeatable, components)

## Missing features

- load Strapi assets
- watch content updates
- stop watching content updates
- localisation handling
- checking ACLs
- document creation
- most document updates
- document delete
- asset upload
- publish document

## Other limitations

As Stackbit loads every Strapi document at startup, this won't work with more than a few hundreds documents in your CMS (long Stackbit start time + huge CPU/RAM usage in Stackbit UI as no pagination is present).
