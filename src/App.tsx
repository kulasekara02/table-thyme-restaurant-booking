import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleUserRound,
  Clock3,
  LoaderCircle,
  LogIn,
  LogOut,
  Mail,
  Menu,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Utensils,
  X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import MenuPreorder from './components/MenuPreorder'
import TableFloorPlan from './components/TableFloorPlan'
import {
  demoMenuItems,
  demoTables,
  formatPrice,
  type MenuItem,
  type RestaurantTable,
} from './lib/restaurant'
import { supabase } from './lib/supabase'
import './App.css'

type View = 'booking' | 'staff'
type StaffSection = 'reservations' | 'customers' | 'team'
type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'
type StaffRole = 'staff' | 'admin'

type Profile = {
  id: string
  email: string
  full_name: string
  role: StaffRole
}

type Customer = {
  id: string
  full_name: string
  email: string
  phone: string
  created_at: string
}

type Reservation = {
  id: string
  customer_id: string
  reservation_at: string
  party_size: number
  note: string
  status: ReservationStatus
  created_at: string
  customer?: Customer
  table?: { table_number: string } | Array<{ table_number: string }> | null
  order_items?: Array<{ item_name: string; quantity: number }>
}

const timeSlots = Array.from({ length: 7 }, (_, index) => {
  const minutes = 17 * 60 + index * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})

const today = new Date()
const localDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
const currentYear = today.getFullYear()

const formatDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))

const formatTime = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date))

const getReservationTableNumber = (reservation: Reservation) =>
  Array.isArray(reservation.table)
    ? reservation.table[0]?.table_number
    : reservation.table?.table_number

function App() {
  const [view, setView] = useState<View>('booking')
  const [section, setSection] = useState<StaffSection>('reservations')
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [panelError, setPanelError] = useState('')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [team, setTeam] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [bookingBusy, setBookingBusy] = useState(false)
  const [bookingError, setBookingError] = useState('')
  const [bookingComplete, setBookingComplete] = useState(false)
  const [bookingConfirmation, setBookingConfirmation] = useState<{
    tableNumber: string
    reservationAt: string
    preorderCount: number
  } | null>(null)
  const [availableTables, setAvailableTables] = useState<RestaurantTable[]>(
    supabase ? [] : demoTables,
  )
  const [availabilityStatus, setAvailabilityStatus] = useState<
    'loading' | 'ready' | 'error' | 'demo'
  >(supabase ? 'loading' : 'demo')
  const [availabilityError, setAvailabilityError] = useState('')
  const [selectedTableId, setSelectedTableId] = useState('')
  const [menuItems, setMenuItems] = useState<MenuItem[]>(
    supabase ? [] : demoMenuItems,
  )
  const [menuLoading, setMenuLoading] = useState(Boolean(supabase))
  const [menuError, setMenuError] = useState('')
  const [orderQuantities, setOrderQuantities] = useState<Record<string, number>>({})
  const [availabilityRefreshKey, setAvailabilityRefreshKey] = useState(0)
  const [bookingForm, setBookingForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    date: localDate(tomorrow),
    time: '19:00',
    partySize: '2',
    note: '',
  })

  useEffect(() => {
    if (!supabase) return

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setAuthError(error.message)
        return
      }
      setSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setProfile(null)
      setAuthError('')
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase) return

    let active = true
    void supabase
      .from('menu_items')
      .select('id, name, description, category, price_cents, currency')
      .eq('is_available', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setMenuError(`Unable to load the pre-order menu: ${error.message}`)
          setMenuItems([])
          setMenuLoading(false)
          return
        }
        setMenuItems((data ?? []) as MenuItem[])
        setMenuLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!supabase || !bookingForm.date || !bookingForm.time) return

    let active = true
    const reservationAt = new Date(`${bookingForm.date}T${bookingForm.time}`)
    void supabase
      .rpc('get_available_tables', {
        p_reservation_at: reservationAt.toISOString(),
        p_party_size: Number(bookingForm.partySize),
      })
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setAvailabilityError(`Unable to check table availability: ${error.message}`)
          setAvailableTables([])
          setSelectedTableId('')
          setAvailabilityStatus('error')
          return
        }

        const tables = (data ?? []) as RestaurantTable[]
        setAvailableTables(tables)
        setSelectedTableId((current) =>
          tables.some((table) => table.id === current) ? current : '',
        )
        setAvailabilityError('')
        setAvailabilityStatus('ready')
      })

    return () => {
      active = false
    }
  }, [
    bookingForm.date,
    bookingForm.partySize,
    bookingForm.time,
    availabilityRefreshKey,
  ])

  useEffect(() => {
    if (!supabase || !session?.user.id) return

    let active = true
    void supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setPanelError(`Unable to load your staff profile: ${error.message}`)
          return
        }
        if (!data) {
          setPanelError('Your account does not have a staff profile. Ask an administrator to invite you.')
          setDataLoading(false)
          return
        }
        setProfile(data as Profile)
      })

    return () => {
      active = false
    }
  }, [session?.user.id])

  useEffect(() => {
    if (!supabase || view !== 'staff' || !session || !profile) return

    let active = true

    void (async () => {
      const [reservationResult, customerResult, teamResult] = await Promise.all([
        supabase
          .from('reservations')
          .select('id, customer_id, reservation_at, party_size, note, status, created_at, table:restaurant_tables(table_number), order_items:reservation_order_items(item_name, quantity)')
          .order('reservation_at', { ascending: true }),
        supabase
          .from('customers')
          .select('id, full_name, email, phone, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, email, full_name, role')
          .order('full_name', { ascending: true }),
      ])

      const error =
        reservationResult.error ?? customerResult.error ?? teamResult.error
      if (error) {
        if (active) {
          setPanelError(`Unable to load restaurant records: ${error.message}`)
          setDataLoading(false)
        }
        return
      }

      const customerRows = (customerResult.data ?? []) as Customer[]
      const customerById = new Map(customerRows.map((customer) => [customer.id, customer]))
      const reservationRows = (reservationResult.data ?? []) as Reservation[]

      if (active) {
        setCustomers(customerRows)
        setReservations(
          reservationRows.map((reservation) => ({
            ...reservation,
            customer: customerById.get(reservation.customer_id),
          })),
        )
        setTeam((teamResult.data ?? []) as Profile[])
        setDataLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [view, session, profile])

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return customers
    return customers.filter((customer) =>
      [customer.full_name, customer.email, customer.phone]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [customers, search])

  const filteredReservations = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return reservations
    return reservations.filter((reservation) =>
      [
        reservation.customer?.full_name,
        reservation.customer?.email,
        reservation.customer?.phone,
        reservation.status,
        getReservationTableNumber(reservation),
        reservation.order_items?.map((item) => item.item_name).join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [reservations, search])

  const selectedTable = availableTables.find((table) => table.id === selectedTableId)
  const selectedItems = useMemo(
    () =>
      menuItems
        .filter((item) => (orderQuantities[item.id] ?? 0) > 0)
        .map((item) => ({ ...item, quantity: orderQuantities[item.id] ?? 0 })),
    [menuItems, orderQuantities],
  )
  const preorderCount = selectedItems.reduce((total, item) => total + item.quantity, 0)
  const preorderTotalCents = selectedItems.reduce(
    (total, item) => total + item.price_cents * item.quantity,
    0,
  )
  const preorderCurrency = selectedItems[0]?.currency ?? menuItems[0]?.currency ?? 'USD'

  const updateReservationChoice = (field: 'date' | 'time' | 'partySize', value: string) => {
    setBookingForm((current) => ({ ...current, [field]: value }))
    setSelectedTableId('')
    setBookingError('')
    if (supabase) {
      setAvailabilityError('')
      setAvailabilityStatus('loading')
    }
  }

  const updateOrderQuantity = (itemId: string, quantity: number) => {
    setOrderQuantities((current) => {
      const next = { ...current }
      if (quantity <= 0) {
        delete next[itemId]
      } else {
        next[itemId] = Math.min(quantity, 20)
      }
      return next
    })
  }

  const openStaff = () => {
    setMenuOpen(false)
    if (!supabase) {
      setLoginOpen(true)
      return
    }
    if (session) {
      setPanelError('')
      setDataLoading(true)
      setView('staff')
      setSearch('')
    } else {
      setLoginOpen(true)
    }
  }

  const submitBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBookingError('')
    setBookingComplete(false)
    if (!supabase) {
      setBookingError('Reservations are not connected yet. Please try again later.')
      return
    }

    const reservationAt = new Date(
      `${bookingForm.date}T${bookingForm.time}`,
    )
    if (reservationAt.getTime() <= Date.now()) {
      setBookingError('Choose a future date and time for your reservation.')
      return
    }
    if (!selectedTable) {
      setBookingError('Choose an available table for your reservation.')
      return
    }
    if (availabilityStatus !== 'ready') {
      setBookingError('Wait for table availability to finish loading, then try again.')
      return
    }

    setBookingBusy(true)
    const { error } = await supabase.rpc('create_reservation_with_preorder', {
      p_full_name: bookingForm.fullName.trim(),
      p_email: bookingForm.email.trim(),
      p_phone: bookingForm.phone.trim(),
      p_party_size: Number(bookingForm.partySize),
      p_reservation_at: reservationAt.toISOString(),
      p_note: bookingForm.note.trim(),
      p_table_id: selectedTable.id,
      p_items: selectedItems.map((item) => ({
        menu_item_id: item.id,
        quantity: item.quantity,
      })),
    })
    setBookingBusy(false)

    if (error) {
      setBookingError(`We couldn't submit your request: ${error.message}`)
      return
    }

    setBookingConfirmation({
      tableNumber: selectedTable.table_number,
      reservationAt: reservationAt.toISOString(),
      preorderCount,
    })
    setBookingComplete(true)
    setAvailabilityRefreshKey((current) => current + 1)
    setOrderQuantities({})
    setBookingForm((current) => ({
      ...current,
      fullName: '',
      email: '',
      phone: '',
      note: '',
    }))
  }

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      setAuthError('Set up the Supabase connection before signing in.')
      return
    }

    const formData = new FormData(event.currentTarget)
    setAuthLoading(true)
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({
      email: String(formData.get('email') ?? '').trim(),
      password: String(formData.get('password') ?? ''),
    })
    setAuthLoading(false)

    if (error) {
      setAuthError(error.message)
      return
    }
    setLoginOpen(false)
    setPanelError('')
    setDataLoading(true)
    setView('staff')
  }

  const signOut = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) {
      setPanelError(`Unable to sign out: ${error.message}`)
      return
    }
    setSession(null)
    setProfile(null)
    setView('booking')
  }

  const changeReservationStatus = async (
    reservationId: string,
    status: ReservationStatus,
  ) => {
    if (!supabase) return
    setPanelError('')
    const { error } = await supabase
      .from('reservations')
      .update({ status })
      .eq('id', reservationId)
    if (error) {
      setPanelError(`Unable to update reservation: ${error.message}`)
      return
    }
    setReservations((current) =>
      current.map((reservation) =>
        reservation.id === reservationId ? { ...reservation, status } : reservation,
      ),
    )
  }

  const changeStaffRole = async (userId: string, role: StaffRole) => {
    if (!supabase) return
    setPanelError('')
    const { error } = await supabase.rpc('set_staff_role', {
      p_target_user_id: userId,
      p_role: role,
    })
    if (error) {
      setPanelError(`Unable to update staff role: ${error.message}`)
      return
    }
    setTeam((current) =>
      current.map((member) => (member.id === userId ? { ...member, role } : member)),
    )
  }

  const bookingReady =
    Boolean(supabase) && availabilityStatus === 'ready' && Boolean(selectedTable)

  return (
    <div className="app-shell">
      <header className="site-header">
        <a
          className="brand"
          href="#home"
          onClick={() => {
            setView('booking')
            setMenuOpen(false)
          }}
          aria-label="Fish restaurant home"
        >
          <span className="brand-mark"><Utensils size={18} strokeWidth={2.2} /></span>
          <span>Fish</span>
        </a>
        <button
          className="mobile-menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav className={menuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">
          <button
            className={view === 'booking' ? 'nav-link active' : 'nav-link'}
            type="button"
            onClick={() => {
              setView('booking')
              setMenuOpen(false)
            }}
          >
            Reservations
          </button>
          <a className="nav-link" href="#experience" onClick={() => setMenuOpen(false)}>Our story</a>
          <a className="nav-link" href="#visit" onClick={() => setMenuOpen(false)}>Visit us</a>
          <button className="staff-link" type="button" onClick={openStaff}>
            {session ? <CircleUserRound size={17} /> : <LogIn size={16} />}
            {session ? 'Staff dashboard' : 'Staff sign in'}
          </button>
        </nav>
      </header>

      {view === 'booking' ? (
        <main id="home">
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow"><Sparkles size={14} /> GOOD FOOD, BETTER COMPANY</span>
              <h1>Make room for<br />a good evening.</h1>
              <p className="hero-description">
                Thoughtful plates, seasonal ingredients, and a table waiting just for you.
              </p>
              <a className="text-link" href="#booking">
                Find your table <ArrowDownRight size={17} />
              </a>
              <div className="hero-note">
                <span className="note-line" />
                <span>Fresh from the kitchen, every day</span>
              </div>
            </div>
            <div className="hero-art" role="img" aria-label="A warm, candlelit restaurant table">
              <div className="art-sun" />
              <div className="art-plate plate-back" />
              <div className="art-plate plate-front"><span /></div>
              <div className="art-leaf leaf-one" />
              <div className="art-leaf leaf-two" />
              <div className="art-candle"><i /></div>
              <div className="art-caption"><span>SEASONAL MENU</span><strong>Made with care.</strong></div>
              <span className="art-index">01 / 04</span>
            </div>
          </section>

          <section className="booking-section" id="booking">
            <div className="section-heading">
              <div>
                <span className="eyebrow">YOUR EVENING STARTS HERE</span>
                <h2>Save your seat.</h2>
              </div>
              <p>Send us a reservation request. Our team will confirm your table shortly.</p>
            </div>
            <div className="booking-card">
              {bookingComplete ? (
                <div className="booking-success" role="status">
                  <span className="success-icon"><Check size={23} /></span>
                  <div>
                    <h3>Your request is on its way.</h3>
                    <p>
                      {bookingConfirmation
                        ? `We received your request for ${bookingConfirmation.tableNumber} on ${formatDate(bookingConfirmation.reservationAt)} at ${formatTime(bookingConfirmation.reservationAt)}.`
                        : 'Thanks for choosing us.'}{' '}
                      {bookingConfirmation?.preorderCount
                        ? `Your ${bookingConfirmation.preorderCount} pre-order item${bookingConfirmation.preorderCount === 1 ? '' : 's'} are included. `
                        : ''}
                      Our team will be in touch to confirm your reservation.
                    </p>
                  </div>
                  <button
                    className="button button-outline"
                    type="button"
                    onClick={() => {
                      setBookingComplete(false)
                      setBookingConfirmation(null)
                      setSelectedTableId('')
                      setBookingError('')
                    }}
                  >
                    Make another request
                  </button>
                </div>
              ) : (
                <form className="booking-form" onSubmit={submitBooking}>
                  <label className="field">
                    <span>Your name</span>
                    <input
                      autoComplete="name"
                      minLength={2}
                      maxLength={100}
                      required
                      value={bookingForm.fullName}
                      onChange={(event) => setBookingForm({ ...bookingForm, fullName: event.target.value })}
                      placeholder="e.g. Alex Morgan"
                    />
                  </label>
                  <label className="field">
                    <span>Email address</span>
                    <input
                      autoComplete="email"
                      maxLength={254}
                      required
                      type="email"
                      value={bookingForm.email}
                      onChange={(event) => setBookingForm({ ...bookingForm, email: event.target.value })}
                      placeholder="you@example.com"
                    />
                  </label>
                  <label className="field">
                    <span>Phone number</span>
                    <input
                      autoComplete="tel"
                      maxLength={30}
                      required
                      type="tel"
                      value={bookingForm.phone}
                      onChange={(event) => setBookingForm({ ...bookingForm, phone: event.target.value })}
                      placeholder="+1 (555) 000-0000"
                    />
                  </label>
                  <label className="field">
                    <span>Date</span>
                    <span className="input-icon"><CalendarDays size={16} /></span>
                    <input
                      min={localDate(today)}
                      required
                      type="date"
                      value={bookingForm.date}
                      onChange={(event) => updateReservationChoice('date', event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Time</span>
                    <span className="input-icon"><Clock3 size={16} /></span>
                    <select
                      required
                      value={bookingForm.time}
                      onChange={(event) => updateReservationChoice('time', event.target.value)}
                    >
                      {timeSlots.map((time) => (
                        <option key={time} value={time}>
                          {formatTime(`2000-01-01T${time}:00`)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="select-chevron" size={15} />
                  </label>
                  <label className="field">
                    <span>Party size</span>
                    <span className="input-icon"><UsersRound size={16} /></span>
                    <select
                      required
                      value={bookingForm.partySize}
                      onChange={(event) => updateReservationChoice('partySize', event.target.value)}
                    >
                      {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                        <option key={count} value={count}>{count} {count === 1 ? 'guest' : 'guests'}</option>
                      ))}
                    </select>
                    <ChevronDown className="select-chevron" size={15} />
                  </label>
                  <label className="field field-wide">
                    <span>Anything we should know? <small>Optional</small></span>
                    <textarea
                      maxLength={500}
                      rows={2}
                      value={bookingForm.note}
                      onChange={(event) => setBookingForm({ ...bookingForm, note: event.target.value })}
                      placeholder="Dietary needs, special occasion, or a note for our team"
                    />
                  </label>
                  <TableFloorPlan
                    tables={availableTables}
                    selectedTableId={selectedTableId}
                    loading={availabilityStatus === 'loading'}
                    error={availabilityError}
                    demoMode={availabilityStatus === 'demo'}
                    onSelect={(tableId) => {
                      setSelectedTableId(tableId)
                      setBookingError('')
                    }}
                  />
                  <MenuPreorder
                    items={menuItems}
                    quantities={orderQuantities}
                    loading={menuLoading}
                    error={menuError}
                    onQuantityChange={updateOrderQuantity}
                  />
                  <div className="booking-summary field-wide" aria-live="polite">
                    <div>
                      <span>Your table</span>
                      <strong>{selectedTable?.table_number ?? 'Choose a table'}</strong>
                    </div>
                    <div>
                      <span>Pre-order</span>
                      <strong>
                        {preorderCount > 0
                          ? `${preorderCount} item${preorderCount === 1 ? '' : 's'} · ${formatPrice(preorderTotalCents, preorderCurrency)}`
                          : 'Nothing selected'}
                      </strong>
                    </div>
                  </div>
                  {bookingError && <p className="form-error field-wide" role="alert">{bookingError}</p>}
                  {!supabase && (
                    <p className="setup-notice field-wide">
                      Demo mode: the sample floor plan and menu are previews. Online reservations will be available once the restaurant database is connected and both migrations are applied.
                    </p>
                  )}
                  <div className="form-footer field-wide">
                    <p>Requests are not confirmed until our team contacts you.</p>
                    <button className="button button-primary" type="submit" disabled={bookingBusy || !bookingReady}>
                      {bookingBusy ? <LoaderCircle className="spin" size={17} /> : null}
                      {bookingBusy ? 'Sending request' : 'Request a table'}
                      {!bookingBusy && <ArrowRight size={17} />}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>

          <section className="experience-section" id="experience">
            <div className="experience-stamp"><span>GROWN WITH<br />GOOD INTENTIONS</span><span className="stamp-star">✳</span></div>
            <div>
              <span className="eyebrow">A LITTLE ABOUT US</span>
              <h2>Good things take<br />a seat at the table.</h2>
              <p>We bring people together over honest, seasonal cooking. Pull up a chair, take your time, and let us take care of the rest.</p>
            </div>
            <div className="experience-aside">
              <span className="aside-number">01</span>
              <p>Local ingredients.<br />Unhurried evenings.<br />A place for everyone.</p>
              <a href="#booking" aria-label="Make a reservation"><ArrowRight size={18} /></a>
            </div>
          </section>

          <section className="visit-section" id="visit">
            <div>
              <span className="eyebrow">COME ON IN</span>
              <h2>There’s a place<br />for you here.</h2>
            </div>
            <div className="visit-details">
              <div><Clock3 size={19} /><p><strong>Sample hours</strong><span>Daily, 5:00 pm – 10:00 pm</span></p></div>
              <div><Phone size={19} /><p><strong>Questions?</strong><span>Contact the restaurant directly</span></p></div>
              <a className="button button-light" href="#booking">Plan your visit <ArrowRight size={17} /></a>
            </div>
          </section>
        </main>
      ) : (
        <main className="staff-page">
          <div className="staff-topline">
            <button type="button" className="back-link" onClick={() => { setView('booking'); setSearch('') }}>
              <ArrowRight size={15} className="back-arrow" /> Back to reservations
            </button>
            <button type="button" className="signout-link" onClick={signOut}><LogOut size={15} /> Sign out</button>
          </div>
          <div className="staff-heading">
            <div>
              <span className="eyebrow">RESTAURANT OPERATIONS</span>
              <h1>Good to see you{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}.</h1>
              <p>Keep the details in order. We’ll take care of the welcome.</p>
            </div>
            <div className="staff-identity">
              <span className="identity-avatar"><CircleUserRound size={22} /></span>
              <span><strong>{profile?.full_name || 'Team member'}</strong><small>{profile?.role || 'Loading profile'}</small></span>
            </div>
          </div>

          {panelError && <p className="panel-error" role="alert">{panelError}</p>}
          {!profile && !panelError && (
            <div className="loading-panel"><LoaderCircle className="spin" size={20} /> Loading your staff profile…</div>
          )}
          {profile && (
            <>
              <div className="stat-grid">
                <article className="stat-card"><span className="stat-icon olive"><CalendarDays size={18} /></span><span className="stat-label">Total reservations</span><strong>{reservations.length}</strong><small>All upcoming and past requests</small></article>
                <article className="stat-card"><span className="stat-icon peach"><UsersRound size={18} /></span><span className="stat-label">Customer records</span><strong>{customers.length}</strong><small>Guests who have booked</small></article>
                <article className="stat-card"><span className="stat-icon lavender"><ShieldCheck size={18} /></span><span className="stat-label">Team members</span><strong>{team.length}</strong><small>Authorized staff accounts</small></article>
              </div>

              <section className="records-panel">
                <div className="records-header">
                  <div className="section-tabs" role="tablist" aria-label="Restaurant records">
                    <button type="button" role="tab" aria-selected={section === 'reservations'} className={section === 'reservations' ? 'section-tab selected' : 'section-tab'} onClick={() => { setSection('reservations'); setSearch('') }}>Reservations</button>
                    <button type="button" role="tab" aria-selected={section === 'customers'} className={section === 'customers' ? 'section-tab selected' : 'section-tab'} onClick={() => { setSection('customers'); setSearch('') }}>Customers</button>
                    <button type="button" role="tab" aria-selected={section === 'team'} className={section === 'team' ? 'section-tab selected' : 'section-tab'} onClick={() => { setSection('team'); setSearch('') }}>Team</button>
                  </div>
                  <label className="search-field">
                    <Search size={16} />
                    <input
                      aria-label={`Search ${section}`}
                      placeholder={`Search ${section.toLowerCase()}…`}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                </div>
                {dataLoading ? (
                  <div className="loading-panel"><LoaderCircle className="spin" size={20} /> Loading restaurant records…</div>
                ) : (
                  <>
                    {section === 'reservations' && (
                      <div className="table-scroll">
                        <table>
                          <thead><tr><th>Guest</th><th>Date & time</th><th>Table</th><th>Party</th><th>Pre-order</th><th>Note</th><th>Status</th></tr></thead>
                          <tbody>
                            {filteredReservations.map((reservation) => (
                              <tr key={reservation.id}>
                                <td><strong>{reservation.customer?.full_name || 'Guest'}</strong><small>{reservation.customer?.email}</small></td>
                                <td>{formatDate(reservation.reservation_at)}<small>{formatTime(reservation.reservation_at)}</small></td>
                                <td>{getReservationTableNumber(reservation) || '—'}</td>
                                <td>{reservation.party_size} {reservation.party_size === 1 ? 'guest' : 'guests'}</td>
                                <td className="note-cell">
                                  {reservation.order_items?.length
                                    ? reservation.order_items
                                      .map((item) => `${item.quantity} × ${item.item_name}`)
                                      .join(', ')
                                    : '—'}
                                </td>
                                <td className="note-cell">{reservation.note || '—'}</td>
                                <td>
                                  <label className="status-select">
                                    <span className={`status-dot ${reservation.status}`} />
                                    <select aria-label={`Status for ${reservation.customer?.full_name || 'reservation'}`} value={reservation.status} onChange={(event) => void changeReservationStatus(reservation.id, event.target.value as ReservationStatus)}>
                                      <option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option>
                                    </select><ChevronDown size={13} />
                                  </label>
                                </td>
                              </tr>
                            ))}
                            {filteredReservations.length === 0 && <tr><td className="empty-row" colSpan={7}>No reservations match your search.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {section === 'customers' && (
                      <div className="table-scroll">
                        <table>
                          <thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>First visit</th></tr></thead>
                          <tbody>
                            {filteredCustomers.map((customer) => (
                              <tr key={customer.id}>
                                <td><strong>{customer.full_name}</strong></td><td>{customer.email}</td><td>{customer.phone}</td><td>{formatDate(customer.created_at)}</td>
                              </tr>
                            ))}
                            {filteredCustomers.length === 0 && <tr><td className="empty-row" colSpan={4}>No customer records match your search.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {section === 'team' && (
                      <div className="table-scroll">
                        <table>
                          <thead><tr><th>Team member</th><th>Email</th><th>Access</th></tr></thead>
                          <tbody>
                            {team.map((member) => (
                              <tr key={member.id}>
                                <td><strong>{member.full_name || 'Team member'}</strong></td><td>{member.email}</td>
                                <td>
                                  {profile.role === 'admin' && member.id !== profile.id ? (
                                    <label className="role-select">
                                      <select aria-label={`Role for ${member.full_name || member.email}`} value={member.role} onChange={(event) => void changeStaffRole(member.id, event.target.value as StaffRole)}>
                                        <option value="staff">Staff</option><option value="admin">Admin</option>
                                      </select><ChevronDown size={13} />
                                    </label>
                                  ) : <span className={`role-badge ${member.role}`}>{member.role === 'admin' ? <ShieldCheck size={13} /> : <CircleUserRound size={13} />}{member.role}</span>}
                                </td>
                              </tr>
                            ))}
                            {team.length === 0 && <tr><td className="empty-row" colSpan={3}>No team members found.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </section>
              {profile.role === 'admin' && (
                <p className="invite-note"><ShieldCheck size={15} /> Invite new team members from Authentication → Users in your Supabase dashboard. New invites receive staff access by default.</p>
              )}
            </>
          )}
        </main>
      )}

      <footer className="site-footer">
        <a className="brand footer-brand" href="#home"><span className="brand-mark"><Utensils size={16} /></span><span>Fish</span></a>
        <span>Good food is better shared.</span>
        <span>© {currentYear} Fish</span>
      </footer>

      {loginOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setLoginOpen(false); setAuthError('') } }}>
          <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
            <button className="modal-close" type="button" aria-label="Close sign in" onClick={() => { setLoginOpen(false); setAuthError('') }}><X size={19} /></button>
            <span className="login-symbol"><ShieldCheck size={22} /></span>
            <span className="eyebrow">TEAM ACCESS</span>
            <h2 id="login-title">Welcome back.</h2>
            <p>Sign in with your restaurant team account.</p>
            {supabase ? (
              <form className="login-form" onSubmit={signIn}>
                <label className="field"><span>Email address</span><span className="input-icon"><Mail size={16} /></span><input autoComplete="username" name="email" required type="email" placeholder="you@restaurant.com" /></label>
                <label className="field"><span>Password</span><input autoComplete="current-password" name="password" required type="password" placeholder="Your password" /></label>
                {authError && <p className="form-error" role="alert">{authError}</p>}
                <button className="button button-primary login-submit" type="submit" disabled={authLoading}>{authLoading ? <LoaderCircle className="spin" size={17} /> : null}{authLoading ? 'Signing in' : 'Sign in'}<ArrowRight size={17} /></button>
              </form>
            ) : (
              <div className="setup-box">
                <p><strong>Staff sign-in is not connected yet.</strong></p>
                <p>Configure the Supabase project and environment variables to enable staff accounts.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default App
