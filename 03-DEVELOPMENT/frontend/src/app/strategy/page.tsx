export default function StrategyPage() {
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Strategy Management</h1>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Available Strategies</h2>
        <p className="text-gray-600 dark:text-gray-300">
          Here you can view, create, and manage your trading strategies.
        </p>
        <div className="mt-4">
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
            Add New Strategy
          </button>
        </div>
      </div>
    </div>
  );
}