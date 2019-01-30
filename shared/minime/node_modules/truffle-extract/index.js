const assert = require('assert')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')

const noop = () => {}

const truffleExtract = (keys, options = {}, cb = noop) => {
  if (typeof options === 'function') {
    cb = options
    options = {}
  }

  const { buildDir, compile, outputDir, warning, verbose } = options
  assert(
    Array.isArray(keys) && keys.length > 0,
    'Must supply at least one key to extract'
  )
  assert(
    buildDir,
    'Must supply a build directory where the truffle build files are located'
  )
  assert(
    outputDir,
    'Must supply an output directory to put the extracted files'
  )

  if (compile) {
    if (verbose) {
      console.log('Compiling...')
    }

    const { execSync } = require('child_process')
    try {
      const output = execSync('npx truffle compile', { encoding: 'utf8' })
      if (verbose) {
        console.log(output)
      }
    } catch (e) {
      // eslint-disable-next-line standard/no-callback-literal
      cb(`compilation error.\n\n${e.stdout}`)
      return
    }
  }

  fs.lstat(buildDir, (err, stat) => {
    if (err) {
      // eslint-disable-next-line standard/no-callback-literal
      cb(
        `seems there was an error accessing ${buildDir}... did you forget to 'truffle compile'?`
      )
      return
    }
    if (!stat.isDirectory()) {
      // eslint-disable-next-line standard/no-callback-literal
      cb(
        `given path (${buildDir}) is not a directory... did you forget to 'truffle compile'?`
      )
      return
    }

    fs.readdir(buildDir, (err, files) => {
      if (err) {
        cb(err)
        return
      }

      // Recreate output dir
      try {
        rimraf.sync(outputDir)
        mkdirp.sync(outputDir)
      } catch (e) {
        cb(e)
        return
      }

      for (const file of files) {
        if (verbose) {
          console.log(`Extracting ${file}...`)
        }
        fs.readFile(path.resolve(buildDir, file), 'utf8', (err, data) => {
          if (err) {
            console.error(`Unexpected failure reading ${file}`, err)
          }
          const buildObj = JSON.parse(data)

          const extractedObj = keys.reduce((extracted, key) => {
            if (buildObj.hasOwnProperty(key)) {
              extracted[key] = buildObj[key]
            } else if (warning) {
              console.warn(`Warning: ${file} missing key '${key}'`)
            }

            return extracted
          }, {})

          fs.writeFile(
            path.resolve(outputDir, file),
            JSON.stringify(extractedObj, null, 2),
            { encoding: 'utf8' },
            err => {
              if (err) {
                console.error(
                  `Unexpected failure writing ${file} to ${outputDir}`,
                  err
                )
              }
            }
          )
        })
      }
    })
  })
}

module.exports = truffleExtract
