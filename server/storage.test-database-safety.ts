const DISPOSABLE_DATABASE_ERROR =
  'Storage integration tests require an explicitly designated disposable database';

const ADMIN_DATABASE_PATTERN = /^ikigai_u4_test_admin_[a-z0-9_]+$/;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export type DisposableStorageTestUrl = {
  connectionString: string;
  databaseName: string;
};

export function assertDisposableStorageTestUrl(
  connectionString: string,
): DisposableStorageTestUrl {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(`${DISPOSABLE_DATABASE_ERROR}: the URL is invalid.`);
  }

  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (
    url.protocol !== 'postgresql:'
    || !LOCAL_HOSTS.has(url.hostname)
    || !ADMIN_DATABASE_PATTERN.test(databaseName)
    || url.search !== ''
  ) {
    throw new Error(
      `${DISPOSABLE_DATABASE_ERROR}: use a local ikigai_u4_test_admin_* database without query parameters.`,
    );
  }

  return { connectionString: url.toString(), databaseName };
}
