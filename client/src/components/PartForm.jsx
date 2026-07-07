import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

const empty = {
  code: '', name: '', description: '', category: '', unit: 'ud',
  stock_current: 0, stock_min: 0, location: '', cost_price: '',
  odoo_product_id: '', odoo_product_name: ''
}

function OdooProductSearch({ value, valueName, onChange, products }) {
  const [query, setQuery] = useState(valueName || '')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Sync display when parent clears/sets value
  useEffect(() => { setQuery(valueName || '') }, [valueName])

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = query.length < 1
    ? products.slice(0, 50)
    : products.filter(p => {
        const q = query.toLowerCase()
        return (
          (p.name || '').toLowerCase().includes(q) ||
          (p.default_code || '').toLowerCase().includes(q)
        )
      }).slice(0, 80)

  function select(p) {
    setQuery(p ? `${p.default_code ? `[${p.default_code}] ` : ''}${p.name}` : '')
    onChange(p ? p.id : null, p ? p.name : '')
    setOpen(false)
  }

  function handleInput(e) {
    setQuery(e.target.value)
    setOpen(true)
    if (!e.target.value) onChange(null, '')
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleInput}
        onFocus={() => setOpen(true)}
        placeholder="Escribe para buscar máquina..."
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoComplete="off"
      />
      {value && (
        <button
          type="button"
          onClick={() => select(null)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-lg leading-none"
        >×</button>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
          {products.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">No hay productos cacheados. Sincroniza primero.</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">Sin resultados</div>
          ) : (
            filtered.map(p => (
              <button
                key={p.id}
                type="button"
                onMouseDown={() => select(p)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-baseline gap-2 ${value === p.id ? 'bg-blue-50 font-medium' : ''}`}
              >
                {p.default_code && (
                  <span className="font-mono text-xs text-gray-400 shrink-0">{p.default_code}</span>
                )}
                <span className="truncate">{p.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function PartForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...empty, ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [odooProducts, setOdooProducts] = useState([])
  const [allLocations, setAllLocations] = useState([])
  const [allCategories, setAllCategories] = useState([])

  useEffect(() => {
    api.getOdooProducts().then(setOdooProducts).catch(() => {})
    api.getPartLocations().then(setAllLocations).catch(() => {})
    api.getPartCategories().then(setAllCategories).catch(() => {})
  }, [])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleOdooSelect(id, name) {
    set('odoo_product_id', id ?? '')
    set('odoo_product_name', name ?? '')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const data = {
        ...form,
        stock_current: Number(form.stock_current),
        stock_min: Number(form.stock_min),
        cost_price: form.cost_price !== '' ? Number(form.cost_price) : null,
        odoo_product_id: form.odoo_product_id !== '' ? Number(form.odoo_product_id) : null,
      }
      await onSave(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const field = (label, key, type = 'text', props = {}) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        {...props}
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {field('Código *', 'code', 'text', { required: true })}
        {field('Nombre *', 'name', 'text', { required: true })}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
        <textarea
          value={form.description}
          onChange={e => set('description', e.target.value)}
          rows={2}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
          <input
            type="text"
            list="partform-categories-list"
            value={form.category || ''}
            onChange={e => set('category', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <datalist id="partform-categories-list">
            {allCategories.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        {field('Unidad', 'unit', 'text', { placeholder: 'ud, kg, m...' })}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {field('Stock actual', 'stock_current', 'number', { step: '0.01' })}
        {field('Stock mínimo', 'stock_min', 'number', { step: '0.01' })}
        {field('Precio coste (€)', 'cost_price', 'number', { step: '0.01', placeholder: '0.00' })}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Ubicación</label>
        <input
          type="text"
          list="partform-locations-list"
          value={form.location || ''}
          onChange={e => set('location', e.target.value)}
          placeholder="Ej: 01*02*03"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <datalist id="partform-locations-list">
          {allLocations.map(l => <option key={l} value={l} />)}
        </datalist>
        <p className="text-xs text-gray-400 mt-1">Para gestionar stock por ubicación, entra en la ficha de la pieza.</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Máquina Odoo <span className="text-gray-400 font-normal">(Titanium Strength · Force USA)</span>
        </label>
        <OdooProductSearch
          value={form.odoo_product_id || null}
          valueName={form.odoo_product_name || ''}
          onChange={handleOdooSelect}
          products={odooProducts}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-5 py-2 rounded-md"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
