import { LoaderCircle } from 'lucide-react'
import type { RestaurantTable } from '../lib/restaurant'

type TableFloorPlanProps = {
  tables: RestaurantTable[]
  selectedTableId: string
  loading: boolean
  error: string
  demoMode: boolean
  onSelect: (tableId: string) => void
}

function TableFloorPlan({
  tables,
  selectedTableId,
  loading,
  error,
  demoMode,
  onSelect,
}: TableFloorPlanProps) {
  return (
    <div className="field field-wide">
      <span id="table-choice-label">Choose your table</span>
      {demoMode && (
        <p className="field-help">Demo floor plan — table choices are a preview until the restaurant database is connected.</p>
      )}
      <div className="floorplan-shell">
        <div className="floorplan-top-label">WINDOWS</div>
        <div className="floorplan-room" role="group" aria-labelledby="table-choice-label">
          <span className="floorplan-area-label area-dining">DINING ROOM</span>
          <span className="floorplan-area-label area-patio">PATIO</span>
          {tables.map((table) => {
            const selected = selectedTableId === table.id
            return (
              <button
                key={table.id}
                aria-label={`Table ${table.table_number}, ${table.capacity} seats, ${table.area}`}
                aria-pressed={selected}
                className={`floorplan-table ${table.shape} ${selected ? 'selected' : ''}`}
                disabled={loading || Boolean(error)}
                onClick={() => onSelect(table.id)}
                style={{
                  left: `${table.layout_x}%`,
                  top: `${table.layout_y}%`,
                }}
                title={`${table.table_number} · ${table.capacity} seats · ${table.area}`}
                type="button"
              >
                <strong>{table.table_number}</strong>
                <small>{table.capacity} seats</small>
              </button>
            )
          })}
          {loading && (
            <div className="floorplan-message" role="status">
              <LoaderCircle className="spin" size={17} /> Checking table availability…
            </div>
          )}
          {!loading && error && <p className="floorplan-message error" role="alert">{error}</p>}
          {!loading && !error && tables.length === 0 && (
            <p className="floorplan-message">No tables fit that party size at this time.</p>
          )}
        </div>
        <div className="floorplan-legend">
          <span><i className="legend-dot available" /> Available</span>
          <span><i className="legend-dot selected" /> Your selection</span>
        </div>
      </div>
    </div>
  )
}

export default TableFloorPlan
