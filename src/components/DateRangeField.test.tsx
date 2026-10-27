import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DateRangeField } from './Phase2Screens'

afterEach(cleanup)

describe('DateRangeField year navigation', () => {
  it('moves by a full year without losing the selected start date', () => {
    const onChange = vi.fn()
    render(<DateRangeField startDate="2022-12-20" endDate="" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '旅行期間を選択' }))
    expect(screen.getByText('2022年 12月')).toBeInTheDocument()
    expect(screen.getByText('12月20日')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '翌年の同じ月' }))
    expect(screen.getByText('2023年 12月')).toBeInTheDocument()
    expect(screen.getByText('12月20日')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '2023年12月20日' }))
    fireEvent.click(screen.getByRole('button', { name: /この期間に決定/ }))
    expect(onChange).toHaveBeenCalledWith('2022-12-20', '2023-12-20')
  })

  it('moves backward by one year and keeps month navigation available', () => {
    render(<DateRangeField startDate="2024-06-15" endDate="2024-06-16" onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '旅行期間を選択' }))

    fireEvent.click(screen.getByRole('button', { name: '前年の同じ月' }))
    expect(screen.getByText('2023年 6月')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '前の月' }))
    expect(screen.getByText('2023年 5月')).toBeInTheDocument()
  })
})
