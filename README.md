# Express Edit Text

**CAUTION: Under active development, not suitable for production use for people
outside the development team yet.**


## Config

You configure the container by setting environment variables:

* `DIR` - The directory containing the editable text files
* `MUSTACHE_DIRS` - A `:` separated list of paths the system should look for mustache templates before using its default ones.
* `DISABLE_AUTH` - Defaults to `false` but can be `true` to make file uploading and downloading work without requiring sign in. Only recommended for development.
* `DISABLED_AUTH_USER` - If `DISABLE_AUTH` is set to `true`, set this to be the JSON-encoded representation of the auth user you want the server to assume is signed in. e.g. `'{"admin": true, "username": "disableduser"}'`. Only recommended for development.
* `SCRIPT_NAME` - The base URL at which the app is hosted. Defaults to `""` and must not end with `/`. Usually this is set to something like `/upload`
* `DEBUG` - The loggers you want to see log output for. e.g. `express-edit-text,express-mustache-jwt-signin`.
* `PORT` - The port you would like the app to run on. Defaults to 80.
* `SECRET` - The secret string used to sign cookies. Make sure this is a long secret that no-one else knows, otherwise they could forge the user information in your cookies. Make sure you set the `SECRET` variable to the same value in the `signin` container too, otherwise they won't recognose each other's cookies.
* `VALIDATION_MODULE_PATH` - An optional absolute path of a `.js` file that exports a validator function with this structure:  `module.exports = { validator: async (filename, content, editableDir) => {} }`. `filename` is the file's filename relative to `edtiableDir` and `content` is the content that the user is trying to save. If the content is not valid an error should be thrown with `const e = new Error(msg); e.validationErrorMessage='Public message to display to the user'; throw e;`

You can also use all the express-mustache-overlays options including `WITH_PJAX_PWA=true`, and all the core `express-mustache-jwt-signin` options.

## Docker Example

Make sure you have installed Docker and Docker Compose for your platform, and
that you can customise your networking so that `www.example.localhost` can
point to `127.0.0.1`.

Also, make sure you have the source code:

```
git clone https://github.com/thejimmyg/express-edit-text.git
cd express-edit-text
```

**Tip: You can also use the published docker image at https://cloud.docker.com/u/thejimmyg/repository/docker/thejimmyg/express-edit-text if you change the `docker-compose.yml` file to use `image: thejimmyg/express-edit-text:0.1.4` instead of building from source**

OK, let's begin.

For local testing, let's imagine you want to use the domain `www.example.localhost`.

You can create certificates as described here:

* https://letsencrypt.org/docs/certificates-for-localhost/

You'll need to put them in the directory `domain/www.example.localhost/sni` in this example. Here's some code that does this:

```
mkdir -p domain/www.example.localhost/sni
openssl req -x509 -out domain/www.example.localhost/sni/cert.pem -keyout domain/www.example.localhost/sni/key.pem \
  -newkey rsa:2048 -nodes -sha256 \
  -subj '/CN=www.example.localhost' -extensions EXT -config <( \
   printf "[dn]\nCN=www.example.localhost\n[req]\ndistinguished_name = dn\n[EXT]\nsubjectAltName=DNS:www.example.localhost\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth")
```

Now edit your `/etc/hosts` so that your domain really points to `127.0.0.1` for local testing. You should have a line that looks like this:

```
127.0.0.1	localhost www.example.localhost example.localhost
```

There is already a user file in `users/users.yaml` which the `signin` container can use. Edit it to change the usernames and passwords as you see fit.

**Tip: You can use a hased password too for the `password` field. Just visit `/user/hash` once the example is running to generarte the hash and then update the file.**

Make a directory where you can override the default templates that are in `views`:

```
mkdir -p views-edit
```

Make an `edit` directory where files will be uploaded to:

```
mkdir -p edit
```

Create a file named `hello.md` inside the `edit` directory for the server to find.

Make sure you change the `SECRET` variable everywhere, otherwise someone could forge your cookies and gain access to your system. You must use the same value for `SECRET` in each of the containers otherwise they won't recognose each other's cookies.

You can now run the containers with:

```
npm run docker:run:local
```

Visit https://www.example.localhost/. You'll probably need to get your browser to accept the certficate since it is a self-signed one, then you'll be asked to sign in using the credentials in `users/users.yml`.

As long as the user you sign in with has the `admin: true` claim in the `users/users.yaml` file, you should be able to edit text files.

Make any tweaks to templates in `views-edit` so that the defaults aren't affected. You can copy the defaults in the `views` directory as a starting point, but make sure you keep the same names.

You can also check the `PUBLIC_FILES_DIRS` overlay at https://www.example.localhost/user/public/hello.txt

When you are finished you can stop the containers with the command below, otherwise Docker will automatically restart them each time you reboot (which is what you want in production, but perhaps not when you are developing):

```
npm run docker:stop:local
```



## Example

```
npm install
VALIDATION_MODULE_PATH=`pwd`/validation/validator.js DISABLE_AUTH=true DISABLED_AUTH_USER='{"admin": true, "username": "disableduser"}' SIGN_IN_URL=/user/signin SCRIPT_NAME="" DEBUG=express-edit-text,express-mustache-overlays,express-mustache-jwt-signin DIR=edit PORT=8000 SECRET='reallysecret' WITH_PJAX_PWA=true npm start
```

Visit http://localhost:8000.

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


## Changelog

### 0.1.13 2019-01-19

* Upgraded express-mustache-jwt-signin

### 0.1.12 2019-01-18

* Upgraded express-mustache-overlays again, removed the `/offline` and `/start` routes as they are provided by express-mustache-overlays now.

### 0.1.11 2019-01-12

* Upgraded express-mustache-overlays (to use the env parsing functions)

### 0.1.10 2019-01-12

* Upgraded express-mustache-overlays (to add PWA support)

### 0.1.9 2019-01-04

* Upgraded express-mustache-overlays (to make use of the `debug` option) and express-mustache-jwt-signin
* Support pluggable validation of the text files via `VALIDATION_MODULE_PATH`
* `npm run docker:run:local` now does the pull before the stop

### 0.1.8 2019-01-02

* Handle SIGTERM
* Support `DISABLED_AUTH_USER`

### 0.1.7 2018-12-29

* Automatically create directories if they are needed.

### 0.1.6 2018-12-20

* Upgrade `express-mustache-jwt-signin`
* Unify navigation and public files

### 0.1.5 2018-12-20

* Fixed incorrect logger name in `docker-compose.yml`
* Fixed a bug with order of directories applied from `MUSTACHE_DIRS` and `PUBLIC_FILES_DIRS`
* Changed the docker example so that the app is hosted at `/`

### 0.1.4 2018-12-20

* Upgraded to `express-mustache-jwt-signin` 0.3.0
* Fixed a bug with `SIGN_IN_URL`

### 0.1.3 2018-12-19

* Added a 500 page and error handling in the routes
* Ability to disable auth with `DISABLE_AUTH`
* Added `Docker example`
* Default port to 80
* Ability to add text file (as long as it is in the directory specified by `DIR`)

### 0.1.2 2018-12-15

* Added a required `SIGN_IN_URL` for the example.
* Added a `403.mustache` template
* Fixed a `</p>` in `404.mustache`

### 0.1.1 2018-12-15

* Made mustacheDirs an array for correct reloading, and allow preferred overlays to be specified as `MUSTACHE_DIRS=viewsDir1:viewsDir2:viewsDir3` etc. The defaults in `views` will still be used last if a particular template or partial can't be found in the specified directories.
* Support for `SCRIPT_NAME`
* Default `DIR` value in Dockerfile

### 0.1.0 2018-12-12

* Initial release
