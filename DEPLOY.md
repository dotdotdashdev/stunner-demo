## Static Deploy (S3 + CloudFront)

This app produces a static `dist/` bundle and can be hosted from an S3 bucket behind CloudFront.

1. Build using the installed library source (recommended for CI/deploy):

```powershell
$env:STUNNER_SOURCE = 'installed'
npm run build
```

2. Upload the `dist/` output to S3:

```powershell
aws s3 sync dist/ s3://<your-bucket-name>/ --delete
```

3. Configure CloudFront:

- Default root object: `index.html`
- SPA fallback: route 403/404 errors to `/index.html` (HTTP 200)
- Enable compression

4. Set cache policy (recommended):

- `index.html`: `Cache-Control: no-cache, no-store, must-revalidate`
- `assets/*` and other hashed static files: `Cache-Control: public, max-age=31536000, immutable`

If you use AWS CLI for cache headers, upload HTML and hashed assets separately so they can use different cache settings.