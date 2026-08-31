#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { bootstrapUser } from './bootstrap-user.mjs';
import { publicStatus, startAndResetLocal } from './lib.mjs';

export async function prepareLocal() {
  const { status, migrations } = startAndResetLocal();
  const user = await bootstrapUser(status);
  return {
    status,
    user,
    public: publicStatus(status),
    migrations,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareLocal()
    .then((result) => {
      console.log(`DICO-QA-Lite listo en ${result.public.hostname}:${result.public.port}`);
      console.log(`Migraciones: ${result.migrations.length}; seed: OK; auth local: OK`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
