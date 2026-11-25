export type RestaurantTable = {
  id: string
  table_number: string
  capacity: number
  area: string
  layout_x: number
  layout_y: number
  shape: 'round' | 'square'
}

export type MenuItem = {
  id: string
  name: string
  description: string
  category: string
  price_cents: number
  currency: string
}

export const demoTables: RestaurantTable[] = [
  { id: 'demo-table-01', table_number: 'T01', capacity: 2, area: 'Window', layout_x: 18, layout_y: 24, shape: 'round' },
  { id: 'demo-table-02', table_number: 'T02', capacity: 2, area: 'Window', layout_x: 47, layout_y: 24, shape: 'round' },
  { id: 'demo-table-03', table_number: 'T03', capacity: 4, area: 'Dining room', layout_x: 78, layout_y: 27, shape: 'square' },
  { id: 'demo-table-04', table_number: 'T04', capacity: 4, area: 'Dining room', layout_x: 23, layout_y: 72, shape: 'square' },
  { id: 'demo-table-05', table_number: 'T05', capacity: 6, area: 'Dining room', layout_x: 53, layout_y: 73, shape: 'square' },
  { id: 'demo-table-06', table_number: 'T06', capacity: 2, area: 'Patio', layout_x: 84, layout_y: 72, shape: 'round' },
]

export const demoMenuItems: MenuItem[] = [
  {
    id: 'demo-menu-01',
    name: 'Charred sourdough',
    description: 'Whipped herb butter, flaky sea salt',
    category: 'To start',
    price_cents: 800,
    currency: 'USD',
  },
  {
    id: 'demo-menu-02',
    name: 'Crispy calamari',
    description: 'Lemon, parsley, house-made aioli',
    category: 'To start',
    price_cents: 1400,
    currency: 'USD',
  },
  {
    id: 'demo-menu-03',
    name: 'Roasted tomato soup',
    description: 'Basil oil, toasted sourdough',
    category: 'To start',
    price_cents: 900,
    currency: 'USD',
  },
  {
    id: 'demo-menu-04',
    name: 'Market fish',
    description: 'Seasonal vegetables, lemon beurre blanc',
    category: 'Mains',
    price_cents: 2600,
    currency: 'USD',
  },
  {
    id: 'demo-menu-05',
    name: 'Herb roast chicken',
    description: 'Crispy potatoes, pan jus',
    category: 'Mains',
    price_cents: 2400,
    currency: 'USD',
  },
  {
    id: 'demo-menu-06',
    name: 'Olive oil cake',
    description: 'Citrus cream, seasonal berries',
    category: 'Dessert',
    price_cents: 1000,
    currency: 'USD',
  },
]

export const formatPrice = (priceCents: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(priceCents / 100)
