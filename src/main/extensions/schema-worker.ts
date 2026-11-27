import { parentPort, workerData } from 'node:worker_threads'
import Ajv from 'ajv'
import Ajv2020 from 'ajv/dist/2020.js'
import Ajv2019 from 'ajv/dist/2019.js'
try {
  const { schema, input } = workerData
  const dialect = String(schema.$schema ?? '')
  const Validator = dialect.includes('2020-12')
    ? Ajv2020
    : dialect.includes('2019-09')
      ? Ajv2019
      : Ajv
  const ajv = new Validator({
    strictSchema: true,
    strictTypes: false,
    validateFormats: false,
    allErrors: false,
    addUsedSchema: false,
  })
  const validate = ajv.compile(schema)
  parentPort?.postMessage({ valid: !!validate(input) })
} catch {
  parentPort?.postMessage({ valid: false })
}
