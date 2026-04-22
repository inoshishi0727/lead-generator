import React, { useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
// No external Badge needed for this component
// Helper function defined locally
import type { OutreachMessage } from '@/lib/types';
// Show all possible steps in a sequence (Initial + Follow-up 1, 2, 3)
const TOTAL_SEQUENCE_STEPS = 4;
interface OutreachTimelineProps {
  message: OutreachMessage;
}

function projectedFollowUpDate(sendDate: string, stepNumber: number): string {
  const base = new Date(sendDate);
  base.setDate(base.getDate() + (stepNumber - 1) * 4);
  const day = base.getDay();
  if (day === 6) base.setDate(base.getDate() + 2);
  if (day === 0) base.setDate(base.getDate() + 1);
  return base.toISOString().split('T')[0];
}

export function OutreachTimeline({ message }: OutreachTimelineProps) {
  // Base dates for the two scenarios
  const baseNow = new Date().toISOString().split('T')[0];
  const baseScheduled = message.scheduled_send_date
    ? new Date(message.scheduled_send_date).toISOString().split('T')[0]
    : baseNow;

  const steps = useMemo(() => {
    const arr: number[] = [];
    for (let i = 1; i <= TOTAL_SEQUENCE_STEPS; i++) arr.push(i);
    return arr;
  }, []);

  const renderTimeline = (baseDate: string, label: string) => (
    <Card className="p-4 mb-4">
      <p className="text-xs font-medium text-muted-foreground mb-2">{label} projection</p>
      <div className="flex items-start">
        {steps.map((step) => {
          const date = step === 1 ? baseDate : projectedFollowUpDate(baseDate, step);
          const stepLabel = step === 1 ? 'Initial email' : `Follow-up ${step - 1}`;
          return (
            <div key={step} className={`flex items-start ${step < steps.length ? 'flex-1 min-w-0' : ''}`}>
              <div className="flex flex-col items-center flex-shrink-0">
                <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold bg-primary text-primary-foreground">
                  {step}
                </div>
                <p className="text-[10px] font-medium mt-1.5 text-primary">{stepLabel}</p>
                {date && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </p>
                )}
              </div>
              {step < steps.length && (
                <div className="flex-1 h-px bg-border/60 mt-4 mx-1" />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );

  return (
    <div>
      {message.scheduled_send_date
        ? renderTimeline(baseScheduled, 'Scheduled')
        : renderTimeline(baseNow, 'Send Now')}
    </div>
  );
}
