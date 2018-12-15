# Express Edit Text

**CAUTION: Under active development, not suitable for production use for people
outside the development team yet.**

## Example

```
npm install
SIGN_IN_URL=/user/signin SCRIPT_NAME=/ DEBUG=express-edit-text,express-mustache-jwt-signin DIR=editable PORT=9006 SECRET='reallysecret' DEBUG=express-edit-text npm start
```

Visit http://localhost:9006.

You should be able to make requests to routes restricted with `signedIn`
middleware as long as you have the cookie, or use the JWT in an `Authorization
header like this:

```
Authorization: Bearer <JWT goes here>
```

A good way of organising this is to use `gateway-lite` as your gateway proxying
both to `express-mustache-jwt-signin` and this module. Then you can use
`express-mustache-jwt-signin` to set the cookie that this project can read as
long as the `SECRET` environmrnt variables are the same.

If you just enable `SECRET` but don't set up the proxy, you'll just get
redirected to the `SIGN_IN_URL` (set to `/user/signin` in the example) and see
a 404 page.

## Development

```
npm run fix
```

## Docker

```
npm run docker:build
docker login <REGISTRY_URL>
npm run docker:push
npm run docker:run
```

## Changelog

# 0.1.2 2018-12-15

* Added a required `SIGN_IN_URL` for the example.
* Added a `403.mustache` template
* Fixed a `</p>` in `404.mustache`

# 0.1.1 2018-12-15

* Made mustacheDirs an array for correct reloading, and allow preferred overlays to be specified as `MUSTACHE_DIRS=viewsDir1:viewsDir2:viewsDir3` etc. The defaults in `views` will still be used last if a particular template or partial can't be found in the specified directories.
* Support for `SCRIPT_NAME`
* Default `DIR` value in Dockerfile

### 0.1.0 2018-12-12

* Initial release
