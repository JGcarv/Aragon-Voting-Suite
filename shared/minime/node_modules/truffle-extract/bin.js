#!/usr/bin/env node

const path = require('path')
const truffleExtract = require('./')

const argv = require('yargs')
  .usage('Usage: $0 [options]')
  .option('keys', {
    alias: 'k',
    default: 'abi',
    describe: 'Keys to extract',
    group: 'Extraction',
    type: 'array',
  })
  .option('build-dir', {
    alias: 'b',
    coerce: buildDir => path.resolve(process.cwd(), buildDir),
    default: 'build/contracts',
    describe: 'Directory of truffle build files',
    group: 'Directories',
    type: 'string',
  })
  .option('output', {
    alias: 'o',
    coerce: output => path.resolve(process.cwd(), output),
    default: 'extracted',
    describe: 'Output directory of extracted files',
    group: 'Directories',
    type: 'string',
  })
  .option('compile', {
    alias: 'c',
    default: 'true',
    describe: 'Compile before extracting',
    type: 'boolean',
  })
  .option('warning', {
    alias: 'w',
    default: true,
    describe: 'Output warnings',
    group: 'Verbosity',
    type: 'boolean',
  })
  .option('verbose', {
    alias: 'v',
    default: false,
    describe: 'Output verbosely',
    group: 'Verbosity',
    type: 'boolean',
  }).argv

const keys = argv.keys
const buildDir = argv['build-dir']
const outputDir = argv.output
const compile = argv.compile
const warning = argv.warning
const verbose = argv.verbose

if (!verbose) {
  console.log('Extracting files...\n')
}

truffleExtract(
  keys,
  { buildDir, compile, outputDir, warning, verbose },
  err => {
    if (err) {
      console.error('Unexpected failure:', err)
      process.exit(1)
    }
  }
)
