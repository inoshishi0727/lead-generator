import { render, screen, fireEvent } from '@testing-library/react';
import { OutreachTimeline } from '@/components/outreach-timeline';
import type { OutreachMessage } from '@/lib/types';

const mockMessage: OutreachMessage = {
  id: 'msg1',
  business_name: 'Test Corp',
  step_number: 1,
  status: 'draft',
  content: 'Hello',
  lead_id: 'lead1',
  // add any required fields
  scheduled_send_date: new Date().toISOString(),
} as any;

test('renders send now and scheduled timelines', () => {
  render(<OutreachTimeline message={mockMessage} />);
  expect(screen.getByText(/Send Now projection/i)).toBeInTheDocument();
  expect(screen.getByText(/Scheduled projection/i)).toBeInTheDocument();
});
