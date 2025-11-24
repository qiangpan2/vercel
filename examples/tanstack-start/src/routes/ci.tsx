import { createFileRoute } from '@tanstack/react-router'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'

export const Route = createFileRoute('/ci')({
  component: CIStatusPage,
  loader: async () => {
    // 在实际应用中，这里会从数据库获取CI数据
    // 生成更多数据以支持分页 (90条记录，3页，每页30条)
    const ciData = []
    const names = ['John Doe', 'Jane Smith', 'Alice Johnson', 'Bob Williams', 'Carol Brown', 'David Wilson', 'Emma Davis', 'Frank Miller', 'Grace Lee', 'Henry Taylor']
    const dockerConfigs = [
      'build: ./docker/Dockerfile\nimage: myapp:latest\nports:\n  - "3000:3000"',
      'build: ./docker/Dockerfile.dev\nimage: myapp:dev\nports:\n  - "3001:3000"\nvolumes:\n  - "./src:/app/src"',
      'build: ./docker/Dockerfile.prod\nimage: myapp:prod\nports:\n  - "80:3000"\n  - "443:3000"',
      'build: ./docker/Dockerfile.staging\nimage: myapp:staging\nports:\n  - "3000:3000"',
      'build: ./docker/Dockerfile.test\nimage: myapp:test\nports:\n  - "3002:3000"',
      'build: ./docker/Dockerfile.backup\nimage: myapp:backup\nports:\n  - "3003:3000"',
      'build: ./docker/Dockerfile.worker\nimage: myapp:worker\nports:\n  - "3004:3000"',
      'build: ./docker/Dockerfile.api\nimage: myapp:api\nports:\n  - "3005:3000"',
    ]

    for (let i = 1; i <= 90; i++) {
      const randomName = names[Math.floor(Math.random() * names.length)]
      const randomConfig = dockerConfigs[Math.floor(Math.random() * dockerConfigs.length)]
      const status = Math.random() > 0.3 ? 'yes' : 'no' // 70% success rate
      const hour = Math.floor(Math.random() * 24)
      const minute = Math.floor(Math.random() * 60)
      const second = Math.floor(Math.random() * 60)
      const day = 20 + Math.floor(Math.random() * 5) // Days 20-24
      const time = `2024-11-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`

      ciData.push({
        id: i.toString(),
        name: randomName,
        time,
        status,
        dockerConfig: randomConfig
      })
    }

    return ciData
  }
})

interface CIData {
  id: string
  name: string
  time: string
  status: string
  dockerConfig: string
}

const columnHelper = createColumnHelper<CIData>()

function CIStatusPage() {
  // 使用loader数据
  const ciData = Route.useLoaderData() as CIData[]

  const getStatusColor = (status: string) => {
    return status.toLowerCase() === 'yes' ? 'text-green-500' : 'text-red-500'
  }

  const getStatusBadge = (status: string) => {
    return status.toLowerCase() === 'yes' ? 'Success' : 'Failed'
  }

  const columns = [
    columnHelper.accessor('name', {
      header: 'Triggered By',
      cell: info => <div className="text-sm font-medium text-white">{info.getValue()}</div>,
    }),
    columnHelper.accessor('time', {
      header: 'Time',
      cell: info => <div className="text-sm text-gray-300">{info.getValue()}</div>,
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: info => (
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(info.getValue())}`}>
          {getStatusBadge(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('dockerConfig', {
      header: 'Docker Config',
      cell: info => (
        <pre className="text-xs text-gray-400 bg-gray-900 p-2 rounded overflow-x-auto max-w-md">
          {info.getValue()}
        </pre>
      ),
    }),
  ]

  const table = useReactTable({
    data: ciData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(), // 启用分页
    initialState: {
      pagination: {
        pageSize: 30, // 每页30条
      }
    }
  })

  return (
    <div className="container mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-black mb-2">CSE Docker Gen CI Dashboard</h1>
        <p className="text-gray-300">Real-time view of your continuous integration pipelines</p>
      </header>

      <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-700/50">
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th
                      key={header.id}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="bg-gray-800/30 divide-y divide-gray-700">
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-700/30 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-6 py-4 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页控件 */}
        <div className="flex items-center justify-between border-t border-gray-700 px-4 py-3">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className={`relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                table.getCanPreviousPage()
                  ? 'text-white bg-gray-700 hover:bg-gray-600'
                  : 'text-gray-500 bg-gray-800 cursor-not-allowed'
              }`}
            >
              Previous
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className={`relative inline-flex items-center px-4 py-2 ml-3 text-sm font-medium rounded-md ${
                table.getCanNextPage()
                  ? 'text-white bg-gray-700 hover:bg-gray-600'
                  : 'text-gray-500 bg-gray-800 cursor-not-allowed'
              }`}
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-400">
                Showing <span className="font-medium">{table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}</span> to{' '}
                <span className="font-medium">
                  {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getRowModel().rows.length)}
                </span>{' '}
                of <span className="font-medium">{table.getRowModel().rows.length}</span> results
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className={`relative inline-flex items-center px-2 py-2 rounded-l-md text-sm font-medium ${
                    table.getCanPreviousPage()
                      ? 'text-white bg-gray-700 hover:bg-gray-600'
                      : 'text-gray-500 bg-gray-800 cursor-not-allowed'
                  }`}
                >
                  Previous
                </button>

                {table.getPageOptions().map(pageIndex => (
                  <button
                    key={pageIndex}
                    onClick={() => table.setPageIndex(pageIndex)}
                    className={`relative inline-flex items-center px-4 py-2 text-sm font-medium ${
                      table.getState().pagination.pageIndex === pageIndex
                        ? 'z-10 text-white bg-cyan-600 border-cyan-500'
                        : 'text-gray-300 bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    {pageIndex + 1}
                  </button>
                ))}

                <button
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className={`relative inline-flex items-center px-2 py-2 rounded-r-md text-sm font-medium ${
                    table.getCanNextPage()
                      ? 'text-white bg-gray-700 hover:bg-gray-600'
                      : 'text-gray-500 bg-gray-800 cursor-not-allowed'
                  }`}
                >
                  Next
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold text-white mb-4">Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-2">Total Builds</h3>
            <div className="text-3xl font-bold text-blue-400">{ciData.length}</div>
            <p className="text-gray-400 mt-1">All CI runs</p>
          </div>

          <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-2">Success Rate</h3>
            <div className="text-3xl font-bold text-green-400">
              {ciData.length > 0 ? Math.round((ciData.filter((item) => item.status.toLowerCase() === 'yes').length / ciData.length) * 100) : 0}%
            </div>
            <p className="text-gray-400 mt-1">Successful builds</p>
          </div>

          <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-2">Active Users</h3>
            <div className="text-3xl font-bold text-yellow-400">
              {[...new Set(ciData.map((item) => item.name))].length}
            </div>
            <p className="text-gray-400 mt-1">Triggering CI builds</p>
          </div>
        </div>
      </div>
    </div>
  )
}
