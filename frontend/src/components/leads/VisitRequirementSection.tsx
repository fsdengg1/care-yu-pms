'use client';

import React from 'react';
import { VisitRequirement } from '@/lib/types';
import { CAREYU_OFFICE_ADDRESS } from '@/lib/company';

export const EMPTY_VISIT_FIELDS = {
  visit_requirement: 'NONE' as VisitRequirement,
  visit_site_name: '',
  visit_site_address: '',
  visit_city: '',
  visit_state: '',
  visit_country: '',
  visit_contact_name: '',
  visit_contact_phone: '',
  visit_contact_email: '',
  visit_preferred_date: '',
  visit_preferred_time: '',
  visit_remarks: '',
  visit_visitor_name: '',
  visit_visitor_designation: '',
  visit_visitor_count: '',
  visit_purpose: '',
  visit_special_requirements: '',
};

export type VisitFormFields = typeof EMPTY_VISIT_FIELDS;

function fieldClass(invalid?: boolean) {
  return `w-full rounded border p-2 focus:border-cyan-500 ${
    invalid ? 'border-rose-700 bg-rose-950/30 text-slate-100' : 'border-slate-800 bg-slate-950 text-slate-100'
  }`;
}

export default function VisitRequirementSection({
  formData,
  customerName,
  onChange,
  missing,
  fieldErrors,
  fieldError,
}: {
  formData: VisitFormFields;
  customerName?: string;
  onChange: (patch: Partial<VisitFormFields>) => void;
  missing: string[];
  fieldErrors: Record<string, string>;
  fieldError: (field: string) => React.ReactNode;
}) {
  const invalid = (field: string) => missing.includes(field) || Boolean(fieldErrors[field]);
  const requirement = formData.visit_requirement || 'NONE';

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block font-semibold text-slate-300">Visit Requirement *</label>
        <select
          name="visit_requirement"
          value={requirement}
          onChange={(e) => onChange({ visit_requirement: e.target.value as VisitRequirement })}
          className={fieldClass(invalid('visit_requirement'))}
        >
          <option value="NONE">No Visit Required</option>
          <option value="CUSTOMER_SITE">CareYu Team Visit to Customer Site</option>
          <option value="CAREYU_OFFICE">Customer Visit to CareYu Office</option>
        </select>
        {fieldError('visit_requirement')}
      </div>

      {requirement === 'CUSTOMER_SITE' && (
        <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
          <h3 className="font-semibold text-slate-200">Customer Site Details</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1 block font-semibold text-slate-300">Customer Site / Plant Name *</label>
              <input name="visit_site_name" value={formData.visit_site_name} onChange={(e) => onChange({ visit_site_name: e.target.value })} className={fieldClass(invalid('visit_site_name'))} />
              {fieldError('visit_site_name')}
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Country *</label>
              <input name="visit_country" value={formData.visit_country} onChange={(e) => onChange({ visit_country: e.target.value })} className={fieldClass(invalid('visit_country'))} />
              {fieldError('visit_country')}
            </div>
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-300">Customer Site Address *</label>
            <textarea name="visit_site_address" rows={2} value={formData.visit_site_address} onChange={(e) => onChange({ visit_site_address: e.target.value })} className={fieldClass(invalid('visit_site_address'))} />
            {fieldError('visit_site_address')}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-semibold text-slate-300">City *</label>
              <input name="visit_city" value={formData.visit_city} onChange={(e) => onChange({ visit_city: e.target.value })} className={fieldClass(invalid('visit_city'))} />
              {fieldError('visit_city')}
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">State *</label>
              <input name="visit_state" value={formData.visit_state} onChange={(e) => onChange({ visit_state: e.target.value })} className={fieldClass(invalid('visit_state'))} />
              {fieldError('visit_state')}
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Contact Person Name *</label>
              <input name="visit_contact_name" value={formData.visit_contact_name} onChange={(e) => onChange({ visit_contact_name: e.target.value })} className={fieldClass(invalid('visit_contact_name'))} />
              {fieldError('visit_contact_name')}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Contact Person Phone *</label>
              <input name="visit_contact_phone" inputMode="numeric" maxLength={10} value={formData.visit_contact_phone} onChange={(e) => onChange({ visit_contact_phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} className={fieldClass(invalid('visit_contact_phone'))} />
              {fieldError('visit_contact_phone')}
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Contact Person Email *</label>
              <input name="visit_contact_email" type="email" value={formData.visit_contact_email} onChange={(e) => onChange({ visit_contact_email: e.target.value })} className={fieldClass(invalid('visit_contact_email'))} />
              {fieldError('visit_contact_email')}
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Customer Preferred Date *</label>
              <input name="visit_preferred_date" type="date" value={formData.visit_preferred_date} onChange={(e) => onChange({ visit_preferred_date: e.target.value })} className={fieldClass(invalid('visit_preferred_date'))} />
              {fieldError('visit_preferred_date')}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-400">Optional Preferred Time</label>
              <input name="visit_preferred_time" type="time" value={formData.visit_preferred_time} onChange={(e) => onChange({ visit_preferred_time: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Customer Remarks / Visit Requirement</label>
              <textarea name="visit_remarks" rows={2} value={formData.visit_remarks} onChange={(e) => onChange({ visit_remarks: e.target.value })} placeholder="Customer requested CareYu team visit to their manufacturing plant..." className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
            </div>
          </div>
        </div>
      )}

      {requirement === 'CAREYU_OFFICE' && (
        <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
          <h3 className="font-semibold text-slate-200">Customer Visit Details</h3>
          <div>
            <label className="mb-1 block font-medium text-slate-400">CareYu Office Address</label>
            <textarea readOnly value={CAREYU_OFFICE_ADDRESS} rows={3} className="w-full cursor-not-allowed rounded border border-slate-800 bg-slate-950 p-2 text-slate-400" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-medium text-slate-400">Customer / Company Name</label>
              <input disabled value={customerName || ''} className="w-full cursor-not-allowed rounded border border-slate-800 bg-slate-950 p-2 text-slate-400" />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Visitor Name *</label>
              <input name="visit_visitor_name" value={formData.visit_visitor_name} onChange={(e) => onChange({ visit_visitor_name: e.target.value })} className={fieldClass(invalid('visit_visitor_name'))} />
              {fieldError('visit_visitor_name')}
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Visitor Designation *</label>
              <input name="visit_visitor_designation" value={formData.visit_visitor_designation} onChange={(e) => onChange({ visit_visitor_designation: e.target.value })} className={fieldClass(invalid('visit_visitor_designation'))} />
              {fieldError('visit_visitor_designation')}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Number of Visitors *</label>
              <input name="visit_visitor_count" inputMode="numeric" value={formData.visit_visitor_count} onChange={(e) => onChange({ visit_visitor_count: e.target.value.replace(/\D/g, '') })} className={fieldClass(invalid('visit_visitor_count'))} />
              {fieldError('visit_visitor_count')}
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Customer Preferred Visit Date *</label>
              <input name="visit_preferred_date" type="date" value={formData.visit_preferred_date} onChange={(e) => onChange({ visit_preferred_date: e.target.value })} className={fieldClass(invalid('visit_preferred_date'))} />
              {fieldError('visit_preferred_date')}
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Preferred Time</label>
              <input name="visit_preferred_time" type="time" value={formData.visit_preferred_time} onChange={(e) => onChange({ visit_preferred_time: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
            </div>
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-300">Purpose of Visit *</label>
            <textarea name="visit_purpose" rows={2} value={formData.visit_purpose} onChange={(e) => onChange({ visit_purpose: e.target.value })} className={fieldClass(invalid('visit_purpose'))} />
            {fieldError('visit_purpose')}
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-400">Special Requirements / Remarks</label>
            <textarea name="visit_special_requirements" rows={2} value={formData.visit_special_requirements} onChange={(e) => onChange({ visit_special_requirements: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
          </div>
        </div>
      )}
    </div>
  );
}
