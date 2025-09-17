import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <div className="text-6xl font-bold text-gray-400 dark:text-gray-600 mb-4">
            404
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            Page not found
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Sorry, we couldn&apos;t find the page you&apos;re looking for.
          </p>
        </div>
        
        <div className="space-y-4">
          <Link
            href="/dashboard"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            Go to Dashboard
          </Link>
          
          <div>
            <Link
              href="/strategy"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
            >
              Strategy Management
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}