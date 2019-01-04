module.exports = {
  validator: async (filename, content, editableDir) => {
    if (content.startsWith('Invalid')) {
      const msg = `The content is invalid because it starts with the text 'Invalid'.`
      const e = new Error(msg)
      e.validationErrorMessage = msg
      throw e
    }
  }
}
