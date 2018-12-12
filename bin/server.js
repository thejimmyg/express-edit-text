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

const port = process.env.PORT || 9005
const scriptName = process.env.SCRIPT_NAME || '/'
const editableDir = process.env.DIR
if (!editableDir) {
  throw new Error('No DIR environment variable set to specify the path of the editable files.')
}
const secret = process.env.SECRET
const mustacheDirs = path.join(__dirname, '..', 'views')

const main = async () => {
  const app = express()
  app.use(cookieParser())

  const templateDefaults = { title: 'Title', signOutURL: '/user/signout', signInURL: '/user/signin' }
  await setupMustache(app, templateDefaults, mustacheDirs)

  let signedIn
  if (secret && secret.length >= 8) {
    debug('Using middleware using secret ' + secret)
    const middlewares = setupMiddleware(secret, {})
    signedIn = middlewares.signedIn
    const withUser = middlewares.withUser
    // Make req.user available to everything
    app.use(withUser)
  } else {
    debug('Not using a signedIn function.')
    signedIn = function (req, res, next) {
      next()
    }
  }

  app.use(bodyParser.urlencoded({ extended: true }))
  app.get(scriptName, signedIn, (req, res) => {
    debug('Edit / handler')
    const ls = shell.ls(editableDir)
    if (shell.error()) {
      throw new Error('Could not list ' + editableDir)
    }
    const files = []
    for (let filename of ls) {
      files.push({ name: filename, url: scriptName + 'edit/' + encodeURIComponent(filename) })
    }
    res.render('list', { user: req.user, title: 'List', files })
  })

  app.all(scriptName + 'edit/*', signedIn, async (req, res) => {
    debug('Edit edit/* handler')
    const filename = req.params[0]
    const filePath = path.join(editableDir, filename)
    debug(filename, filePath)
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
    res.status(500).send('Something broke!')
  })

  app.listen(port, () => console.log(`Example app listening on port ${port}`))
}

main()

// Better handling of SIGNIN for docker
process.on('SIGINT', function () {
  console.log('Exiting ...')
  process.exit()
})
