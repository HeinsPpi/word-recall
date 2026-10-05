import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
vi.mock('react-chartjs-2', () => ({ Doughnut: () => <div data-testid="donut"/>, Line: () => <div data-testid="line"/> }))
import { DonutChart } from '../src/components/DonutChart'
import { SetupPage } from '../src/pages/SetupPage'

describe('components', () => {
  it('shows the progress rate in the donut center', () => { render(<DonutChart initiallyKnown={900} mastered={40} learning={60} rate={.94}/>); expect(screen.getByText('94%')).toBeInTheDocument() })
  it('shows setup error and retry rather than a blank screen', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok:false, status:404 })); render(<SetupPage onReady={() => undefined}/>); expect(await screen.findByText(/辞書データがまだ配置/)).toBeInTheDocument(); fireEvent.click(screen.getByRole('button',{name:'もう一度試す'})); expect(fetch).toHaveBeenCalledTimes(2); vi.unstubAllGlobals() })
})
