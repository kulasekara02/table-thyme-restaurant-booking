import { LoaderCircle, Minus, Plus } from 'lucide-react'
import type { MenuItem } from '../lib/restaurant'
import { formatPrice } from '../lib/restaurant'

type MenuPreorderProps = {
  items: MenuItem[]
  quantities: Record<string, number>
  loading: boolean
  error: string
  onQuantityChange: (itemId: string, quantity: number) => void
}

function MenuPreorder({
  items,
  quantities,
  loading,
  error,
  onQuantityChange,
}: MenuPreorderProps) {
  return (
    <section className="field-wide preorder-section" aria-labelledby="preorder-heading">
      <div className="menu-section-heading">
        <div>
          <span className="eyebrow">A LITTLE SOMETHING BEFORE YOU ARRIVE</span>
          <h3 id="preorder-heading">Pre-order for your table.</h3>
        </div>
        <span className="optional-label">Optional</span>
      </div>
      <p className="field-help">Choose a few favorites and we’ll have your order ready when you arrive.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? (
        <div className="menu-loading" role="status"><LoaderCircle className="spin" size={17} /> Loading the menu…</div>
      ) : items.length === 0 ? (
        <p className="menu-empty">There are no menu items available to pre-order right now.</p>
      ) : (
        <div className="menu-item-grid">
          {items.map((item) => {
            const quantity = quantities[item.id] ?? 0
            return (
              <article className="menu-item-card" key={item.id}>
                <div className="menu-item-copy">
                  <span className="menu-category">{item.category}</span>
                  <h4>{item.name}</h4>
                  <p>{item.description}</p>
                  <strong className="menu-price">{formatPrice(item.price_cents, item.currency)}</strong>
                </div>
                {quantity === 0 ? (
                  <button
                    aria-label={`Add ${item.name}`}
                    className="menu-add-button"
                    onClick={() => onQuantityChange(item.id, 1)}
                    type="button"
                  >
                    <Plus size={16} />
                  </button>
                ) : (
                  <div className="quantity-control" aria-label={`${item.name} quantity`}>
                    <button
                      aria-label={`Remove one ${item.name}`}
                      onClick={() => onQuantityChange(item.id, quantity - 1)}
                      type="button"
                    >
                      <Minus size={14} />
                    </button>
                    <span aria-live="polite">{quantity}</span>
                    <button
                      aria-label={`Add one ${item.name}`}
                      disabled={quantity >= 20}
                      onClick={() => onQuantityChange(item.id, quantity + 1)}
                      type="button"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default MenuPreorder
