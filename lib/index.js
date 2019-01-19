const bodyParser = require('body-parser')
const debug = require('debug')('express-edit-text')
const express = require('express')
const fs = require('fs')
const path = require('path')
const shell = require('shelljs')
const { promisify } = require('util')

const readFileAsync = promisify(fs.readFile)
const lstatAsync = promisify(fs.lstat)
const writeFileAsync = promisify(fs.writeFile)

var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();

const editText = async (overlays, signedIn, hasClaims, editableDir, { validator, editTitle = 'Editing', listTitle = 'Edit Text Files' }) => {
  const app = express()
  app.use(bodyParser.urlencoded({ extended: true }))
  app.use(multipartMiddleware)

  overlays.overlayMustacheDir(path.join(__dirname, '..', 'views'))
  overlays.overlayPublicFilesDir(path.join(__dirname, '..', 'public'))

  app.get('/', signedIn, async (req, res, next) => {
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
          files.push({ name: filename, url: 'edit?filename=' + encodeURIComponent(filename) })
        }
      }
      res.render('list', { title: listTitle, files })
    } catch (e) {
      debug(e)
      next(e)
    }
  })

  app.all('/edit', signedIn, hasClaims(claims => claims.admin), async (req, res, next) => {
    try {
      debug('Edit edit/* handler')
      debug(req.method, 'content-length:', req.get('content-length'))
      debug(req.query)
      const filename = req.query['filename'] //  || req.body.filename
      debug(filename, req.query['filename'] , req.body.filename)
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
      // const action = req.path
      const action = req.originalUrl
      let content = ''
      if (req.method === 'POST') {
        content = req.body.content
        debug('Got content', content)
        let error = false
        try {
          await validator(filename, content, editableDir)
          await writeFileAsync(filePath, content, { encoding: 'UTF-8' })
        } catch (e) {
          if (e.validationErrorMessage) {
            editError = e.validationErrorMessage
          } else {
            editError = 'Could not save the file'
          }
          debug(e.toString())
          error = true
        }
        if (error) {
          debug('Error', editError)
          res.render('edit', { title: 'Error', content, editError, action, filename })
          return
        } else {
          editSuccess = 'File saved.'
          debug('Success',  editSuccess)
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
      debug('Rendering response for:', filename)
      res.render('edit', { title: editTitle, action, editSuccess, content, filename })
      debug('All done')
    } catch (e) {
      debug(e)
      next(e)
    }
  })

  return app
}

module.exports = { editText }
