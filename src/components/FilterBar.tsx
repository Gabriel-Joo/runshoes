import './FilterBar.css'

const PURPOSES = [
  '전체',
  '조깅·회복주',
  '템포·인터벌',
  'LSD·장거리',
  '레이스',
  '트레일',
]

interface FilterBarProps {
  selected: string
  onSelect: (purpose: string) => void
}

function FilterBar({ selected, onSelect }: FilterBarProps) {
  return (
    <div className="filter">
      {PURPOSES.map((purpose) => (
        <button
          key={purpose}
          className={`filter__chip ${selected === purpose ? 'is-active' : ''}`}
          onClick={() => onSelect(purpose)}
        >
          {purpose}
        </button>
      ))}
    </div>
  )
}

export default FilterBar