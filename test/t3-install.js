// Where the T3 Code the tests check against is installed: where
// launcher/find-t3.cmd finds it, or T3LATEX_T3_DIR (a folder holding
// resources\server.asar, e.g. an unpacked nightly build) to check another
// build without installing it.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const { findT3 } = createRequire(import.meta.url)('../launcher/launch.cjs')
const exe = findT3()

export const T3_DIR = process.env.T3LATEX_T3_DIR || (exe ? dirname(exe) : '')
export const T3_SERVER_ASAR = join(T3_DIR, 'resources', 'server.asar')
