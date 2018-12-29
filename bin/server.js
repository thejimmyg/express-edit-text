const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const debug = require('debug')('express-edit-text')
const express = require('express')
const fs = require('fs')
const path = require('path')
const { prepareMustacheOverlays, setupErrorHandlers } = require('express-mustache-overlays')
const shell = require('shelljs')
const { setupMiddleware } = require('express-mustache-jwt-signin')
const { promisify } = require('util')

const readFileAsync = promisify(fs.readFile)
const lstatAsync = promisify(fs.lstat)
const writeFileAsync = promisify(fs.writeFile)

const port = process.env.PORT || 80
const scriptName = process.env.SCRIPT_NAME || ''
if (scriptName.endsWith('/')) {
  throw new Error('SCRIPT_NAME should not end with /.')
}
const editableDir = process.env.DIR
if (!editableDir) {
  throw new Error('No DIR environment variable set to specify the path of the editable files.')
}
const secret = process.env.SECRET
const signInURL = process.env.SIGN_IN_URL || '/user/signin'
const signOutURL = process.env.SIGN_OUT_URL || '/user/signout'
const disableAuth = ((process.env.DISABLE_AUTH || 'false').toLowerCase() === 'true')
if (!disableAuth) {
  if (!secret || secret.length < 8) {
    throw new Error('No SECRET environment variable set, or the SECRET is too short. Need 8 characters')
  }
  if (!signInURL) {
    throw new Error('No SIGN_IN_URL environment variable set')
  }
} else {
  debug('Disabled auth')
}
const mustacheDirs = process.env.MUSTACHE_DIRS ? process.env.MUSTACHE_DIRS.split(':') : []
const publicFilesDirs = process.env.PUBLIC_FILES_DIRS ? process.env.PUBLIC_FILES_DIRS.split(':') : []
const publicURLPath = process.env.PUBLIC_URL_PATH || scriptName + '/public'
const listTitle = process.env.LIST_TITLE || 'Edit Text Files'
const editTitle = process.env.EDIT_TITLE || 'Editing'

const main = async () => {
  const app = express()
  app.use(cookieParser())

  const overlays = await prepareMustacheOverlays(app, { scriptName, publicURLPath })

  app.use((req, res, next) => {
    debug('Setting up locals')
    res.locals = Object.assign({}, res.locals, { publicURLPath, scriptName, title: 'Express Edit Text', signOutURL: signOutURL, signInURL: signInURL })
    next()
  })

  let { signedIn, withUser, hasClaims } = await setupMiddleware(app, secret, { overlays, signOutURL, signInURL })
  if (disableAuth) {
    signedIn = function (req, res, next) {
      debug(`signedIn disabled by DISBABLE_AUTH='true'`)
      next()
    }
    hasClaims = function () {
      return function (req, res, next) {
        debug(`hasClaims disabled by DISBABLE_AUTH='true'`)
        next()
      }
    }
  } else {
    app.use(withUser)
  }

  overlays.overlayMustacheDir(path.join(__dirname, '..', 'views'))
  overlays.overlayPublicFilesDir(path.join(__dirname, '..', 'public'))

  // Set up any other overlays directories here
  mustacheDirs.forEach(dir => {
    debug('Adding mustache dir', dir)
    overlays.overlayMustacheDir(dir)
  })
  publicFilesDirs.forEach(dir => {
    debug('Adding publicFiles dir', dir)
    overlays.overlayPublicFilesDir(dir)
  })

  app.use(bodyParser.urlencoded({ extended: true }))
  app.get(scriptName, signedIn, async (req, res, next) => {
    try {
      debug('Edit / handler')
      const ls = shell.ls('-R', editableDir)
      if (shell.error()) {
        throw new Error('Could not list ' + editableDir)
      }
      const files = []
      for (let filename of ls) {
        const stat = await lstatAsync(path.join(editableDir, filename))
        if (stat.isFile()) {
          files.push({ name: filename, url: scriptName + '/edit?filename=' + encodeURIComponent(filename) })
        }
      }
      res.render('list', { title: listTitle, files })
    } catch (e) {
      debug(e)
      next(e)
    }
  })

  // app.all(scriptName + '/throw', signedIn, hasClaims(claims => claims.admin), async (req, res, next) => {
  //   try {
  //     throw new Error('test')
  //   } catch (e) {
  //     next(e)
  //     return
  //   }
  // })

  app.all(scriptName + '/edit', signedIn, hasClaims(claims => claims.admin), async (req, res, next) => {
    try {
      debug('Edit edit/* handler')
      debug(req.query)
      const filename = req.query['filename']
      debug(filename)
      const filePath = path.join(editableDir, filename)
      const expected = path.normalize(editableDir)
      if (!path.normalize(filePath).startsWith(expected + '/')) {
        throw new Error('Requested file is not in the editable directory: ' + filePath)
      }
      debug(filePath)
      shell.mkdir('-p', path.dirname(filePath))
      if (shell.error()) {
        throw new Error(`Could not create directories for ${filePath}.`)
      }
      let editError = ''
      let editSuccess = ''
      const action = '.'
      let content = ''
      if (req.method === 'POST') {
        content = req.body.content
        let error = false
        try {
          await writeFileAsync(filePath, content, { encoding: 'UTF-8' })
        } catch (e) {
          editError = 'Could not save the file'
          debug(e.toString())
          error = true
        }
        if (error) {
          res.render('edit', { title: 'Error', content, editError, action, filename })
          return
        } else {
          editSuccess = 'File saved.'
        }
      }
      if (req.method === 'GET' || editError.length === 0) {
        try {
          content = await readFileAsync(filePath, { encoding: 'UTF-8' })
        } catch (e) {
          debug(e)
          content = ''
        }
        debug(content)
      }
      res.render('edit', { title: editTitle, editSuccess, content, filename })
    } catch (e) {
      debug(e)
      next(e)
    }
  })

  overlays.setup()

  setupErrorHandlers(app)

  app.listen(port, () => console.log(`Example app listening on port ${port}`))
}

main()

// Better handling of SIGNIN for docker
process.on('SIGINT', function () {
  console.log('Exiting ...')
  process.exit()
})
