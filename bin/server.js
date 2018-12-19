const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const debug = require('debug')('express-edit-text')
const express = require('express')
const fs = require('fs')
const path = require('path')
const setupMustache = require('express-mustache-overlays')
const shell = require('shelljs')
const { setupMiddleware } = require('express-mustache-jwt-signin')
const { promisify } = require('util')

const readFileAsync = promisify(fs.readFile)
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
const signInURL = process.env.SIGN_IN_URL
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
mustacheDirs.push(path.join(__dirname, '..', 'views'))

const main = async () => {
  const app = express()
  app.use(cookieParser())

  const templateDefaults = { title: 'Title', scriptName, signOutURL: '/user/signout', signInURL: '/user/signin' }
  await setupMustache(app, templateDefaults, mustacheDirs)

  let { signedIn, withUser, hasClaims } = setupMiddleware(secret, { signInURL })
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

  app.use(bodyParser.urlencoded({ extended: true }))
  app.get(scriptName, signedIn, (req, res, next) => {
    try {
      debug('Edit / handler')
      const ls = shell.ls(editableDir)
      if (shell.error()) {
        throw new Error('Could not list ' + editableDir)
      }
      const files = []
      for (let filename of ls) {
        files.push({ name: filename, url: scriptName + '/edit?filename=' + encodeURIComponent(filename) })
      }
      res.render('list', { user: req.user, scriptName, title: 'List', files })
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
      // XXX Check directory
      const expected = path.normalize(editableDir)
      if (!path.normalize(filePath).startsWith(expected+'/')) {
        throw new Error('Requested file is not in the editable directory: '+filePath)
      }
      debug(filePath)
      let editError = ''
      let editSuccess = ''
      const action = req.path
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
          res.render('edit', { user: req.user, title: 'Success', scriptName, content, editError, action, filename })
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
      res.render('edit', { user: req.user, title: 'Edit', scriptName, editSuccess, content, filename })
    } catch (e) {
      debug(e)
      next(e)
    }
  })

  app.use(express.static(path.join(__dirname, '..', 'public')))

  // Must be after other routes - Handle 404
  app.get('*', (req, res) => {
    res.status(404)
    res.render('404', { user: req.user, scriptName })
  })

  // Error handler has to be last
  app.use(function (err, req, res, next) {
    debug('Error:', err)
    res.status(500)
    try {
      res.render('500', { user: req.user, scriptName })
    } catch (e) {
      debug('Error during rendering 500 page:', e)
      res.send('Internal server error.')
    }
  })

  app.listen(port, () => console.log(`Example app listening on port ${port}`))
}

main()

// Better handling of SIGNIN for docker
process.on('SIGINT', function () {
  console.log('Exiting ...')
  process.exit()
})
