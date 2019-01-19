const cookieParser = require('cookie-parser')
const debug = require('debug')('express-edit-text')
const { editText } = require('../lib/index.js')
const express = require('express')
const { overlaysOptionsFromEnv, overlaysDirsFromEnv, prepareMustacheOverlays, setupErrorHandlers } = require('express-mustache-overlays')
const { makeStaticWithUser, setupMiddleware, signInOptionsFromEnv } = require('express-mustache-jwt-signin')

const port = process.env.PORT || 80
const overlaysOptions = overlaysOptionsFromEnv()
const { scriptName } = overlaysOptions
const { mustacheDirs, publicFilesDirs } = overlaysDirsFromEnv()
const signInOptions = signInOptionsFromEnv(scriptName)
const { signInUrl, signOutUrl } = signInOptions
const secret = process.env.SECRET
const editableDir = process.env.DIR
if (!editableDir) {
  throw new Error('No DIR environment variable set to specify the path of the editable files.')
}
const disableAuth = ((process.env.DISABLE_AUTH || 'false').toLowerCase() === 'true')
if (!disableAuth) {
  if (!secret || secret.length < 8) {
    throw new Error('No SECRET environment variable set, or the SECRET is too short. Need 8 characters')
  }
  if (!signInUrl) {
    throw new Error('No SIGN_IN_URL environment variable set')
  }
  if (!signOutUrl) {
    throw new Error('No SIGN_OUT_URL environment variable set')
  }
} else {
  debug('Disabled auth')
}
const disabledAuthUser = process.env.DISABLED_AUTH_USER
const listTitle = process.env.LIST_TITLE || 'Edit Text Files'
const editTitle = process.env.EDIT_TITLE || 'Editing'
let validator = async (filename, content, editableDir) => {
}
if (process.env.VALIDATION_MODULE_PATH) {
  debug(`Using the validator() async funtion exported as the 'validator' key from '${process.env.VALIDATION_MODULE_PATH}'`)
  validator = require(process.env.VALIDATION_MODULE_PATH).validator
}

const main = async () => {
  const app = express()
  app.use(cookieParser())

  const overlays = await prepareMustacheOverlays(app, overlaysOptions)

  const authMiddleware = await setupMiddleware(app, secret, Object.assign({ overlays }, signInOptions))
  const { signedIn, hasClaims } = authMiddleware
  let { withUser } = authMiddleware
  if (disableAuth) {
    withUser = makeStaticWithUser(JSON.parse(disabledAuthUser || 'null'))
  }
  app.use(withUser)

  // Magic here
  const subApp = await editText(overlays, signedIn, hasClaims, editableDir, { validator, editTitle, listTitle })
  app.use(scriptName, subApp)


  // Set up any other overlays directories here
  mustacheDirs.forEach(dir => {
    debug('Adding mustache dir', dir)
    overlays.overlayMustacheDir(dir)
  })
  publicFilesDirs.forEach(dir => {
    debug('Adding publicFiles dir', dir)
    overlays.overlayPublicFilesDir(dir)
  })

  await overlays.setup()

  await setupErrorHandlers(app, { debug })

  app.listen(port, () => console.log(`Example app listening on port ${port}`))
}

main()

// Better handling of SIGINT and SIGTERM for docker
process.on('SIGINT', function () {
  console.log('Received SIGINT. Exiting ...')
  process.exit()
})

process.on('SIGTERM', function () {
  console.log('Received SIGTERM. Exiting ...')
  process.exit()
})
