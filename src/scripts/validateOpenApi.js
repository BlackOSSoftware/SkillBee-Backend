import { openApiSpec } from '../docs/openapi.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  assert(openApiSpec.openapi?.startsWith('3.'), 'openapi version must be 3.x');
  assert(openApiSpec.info?.title, 'info.title is required');
  assert(openApiSpec.info?.version, 'info.version is required');
  assert(openApiSpec.paths && Object.keys(openApiSpec.paths).length > 0, 'paths required');

  for (const [path, methods] of Object.entries(openApiSpec.paths)) {
    assert(path.startsWith('/'), `Path must start with /: ${path}`);
    for (const [method, operation] of Object.entries(methods)) {
      assert(operation.responses, `Missing responses for ${method.toUpperCase()} ${path}`);
      assert(
        Object.keys(operation.responses).length > 0,
        `Empty responses for ${method.toUpperCase()} ${path}`
      );
    }
  }

  console.log('OpenAPI document looks valid.');
  console.log(`  title: ${openApiSpec.info.title}`);
  console.log(`  version: ${openApiSpec.info.version}`);
  console.log(`  paths: ${Object.keys(openApiSpec.paths).length}`);
}

try {
  main();
} catch (err) {
  console.error('OpenAPI validation failed:', err.message);
  process.exit(1);
}
