import type { ReactNode } from 'react'
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
  /** 칩 줄에 같이 놓을 검색창 — 1200px 이상은 칩 오른쪽, 1199px 이하는 칩 위 한 줄 */
  search?: ReactNode
}

function FilterBar({ selected, onSelect, search }: FilterBarProps) {
  return (
    <div className="filter">
      <div className="filter__chips">
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
      {search && <div className="filter__search">{search}</div>}
    </div>
  )
}

export default FilterBar
