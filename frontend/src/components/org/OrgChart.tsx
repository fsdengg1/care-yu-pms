'use client';

import React, { useMemo } from 'react';
import { Code2, Eye, Bot, ShoppingCart, HardHat } from 'lucide-react';
import { Role, Team, User } from '@/lib/types';
import { chartDisplayName } from './orgHierarchy';

interface OrgChartProps {
  users: User[];
  teams: Team[];
  roles?: Role[];
  selectedId?: string | null;
  onSelectPerson: (user: User) => void;
  onSelectTeam: (team: Team) => void;
}

export default function OrgChart({
  users,
  teams,
  selectedId,
  onSelectPerson,
  onSelectTeam,
}: OrgChartProps) {
  // Find key management users
  const ceoUser = useMemo(
    () => users.find((u) => u.role_code === 'CEO') || users.find((u) => /bernard/i.test(u.name)),
    [users]
  );
  const ctoUser = useMemo(
    () => users.find((u) => u.role_code === 'CTO') || users.find((u) => /ilaya|raja/i.test(u.name)),
    [users]
  );
  const bhUser = useMemo(
    () =>
      users.find((u) => u.role_code === 'BUSINESS_HEAD') ||
      users.find((u) => /shradha|sharadha/i.test(u.name)),
    [users]
  );
  const edUser = useMemo(
    () => users.find((u) => u.role_code === 'ENG_DIRECTOR') || users.find((u) => /sabarigiri/i.test(u.name)),
    [users]
  );
  const pmUser = useMemo(
    () => users.find((u) => u.role_code === 'PROJECT_MANAGER') || users.find((u) => /arivan/i.test(u.name)),
    [users]
  );

  // Map 5 functional teams in exact canonical order
  const swTeam = useMemo(
    () => teams.find((t) => t.code === 'SOFTWARE') || teams.find((t) => /software/i.test(t.name)),
    [teams]
  );
  const visTeam = useMemo(
    () => teams.find((t) => t.code === 'VISION') || teams.find((t) => /vision/i.test(t.name)),
    [teams]
  );
  const robTeam = useMemo(
    () => teams.find((t) => t.code === 'ROBOTICS') || teams.find((t) => /robotics/i.test(t.name)),
    [teams]
  );
  const procTeam = useMemo(
    () => teams.find((t) => t.code === 'PROCUREMENT') || teams.find((t) => /procurement/i.test(t.name)),
    [teams]
  );
  const execTeam = useMemo(
    () => teams.find((t) => t.code === 'EXECUTION') || teams.find((t) => /execution/i.test(t.name)),
    [teams]
  );

  const teamList = [
    {
      team: swTeam,
      title: 'Software Team',
      bgClass: 'bg-[#15803D]',
      icon: <Code2 className="h-5 w-5 text-white" />,
    },
    {
      team: visTeam,
      title: 'Vision Team',
      bgClass: 'bg-[#0F766E]',
      icon: <Eye className="h-5 w-5 text-white" />,
    },
    {
      team: robTeam,
      title: 'Robotics & Solutions Team',
      bgClass: 'bg-[#C2410C]',
      icon: (
        <span className="flex items-center -space-x-1">
          <Bot className="h-4 w-4 text-white" />
          <Bot className="h-4 w-4 text-white" />
        </span>
      ),
    },
    {
      team: procTeam,
      title: 'Procurement / Costing Team',
      bgClass: 'bg-[#1D4ED8]',
      icon: <ShoppingCart className="h-5 w-5 text-white" />,
    },
    {
      team: execTeam,
      title: 'Execution Team',
      bgClass: 'bg-[#7C3AED]',
      icon: <HardHat className="h-5 w-5 text-white" />,
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* 1. Header Banner */}
      <div className="bg-[#0B1F3A] py-2.5 px-4 text-center text-xs sm:text-sm font-bold uppercase tracking-[0.14em] text-white">
        1. ORGANIZATIONAL HIERARCHY & ACCESS SCOPE
      </div>

      {/* Main Diagram Canvas */}
      <div className="overflow-x-auto bg-[#F8FAFC] px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto flex min-w-[780px] max-w-[940px] flex-col items-center">
          {/* Level 1: CEO Card */}
          <button
            type="button"
            onClick={() => ceoUser && onSelectPerson(ceoUser)}
            className={`group relative z-10 flex w-56 flex-col items-center rounded-lg bg-[#0B1F3A] px-3 py-2.5 text-center text-white shadow-md transition hover:scale-[1.02] ${
              selectedId === ceoUser?.id ? 'ring-2 ring-amber-400 ring-offset-2' : ''
            }`}
          >
            <div className="text-xs sm:text-sm font-bold leading-tight">
              {ceoUser ? chartDisplayName(ceoUser) : 'Bernard Hamilton'}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-slate-200">CEO</div>
            <div className="mt-0.5 text-[10px] font-medium text-slate-300">(Access: All Dashboards)</div>
          </button>

          {/* Stem down from CEO to Executive Row Connector */}
          <div className="h-6 w-px bg-slate-400" />

          {/* Level 2: 3 Executive Columns */}
          <div className="w-full max-w-[720px]">
            {/* Horizontal Line connecting column centers (16.66% to 83.33%) */}
            <div className="relative w-full">
              <div className="absolute left-[16.666%] right-[16.666%] top-0 h-px bg-slate-400" />
            </div>

            <div className="grid grid-cols-3 gap-4 sm:gap-6">
              {/* Left: CTO */}
              <div className="flex flex-col items-center">
                <div className="h-5 w-px bg-slate-400" />
                <button
                  type="button"
                  onClick={() => ctoUser && onSelectPerson(ctoUser)}
                  className={`w-full rounded-lg bg-[#0D5C4D] px-2.5 py-2.5 text-center text-white shadow-md transition hover:scale-[1.02] ${
                    selectedId === ctoUser?.id ? 'ring-2 ring-amber-400 ring-offset-2' : ''
                  }`}
                >
                  <div className="text-xs sm:text-sm font-bold leading-tight">
                    {ctoUser ? chartDisplayName(ctoUser) : 'Raja'}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-teal-100">CTO</div>
                  <div className="mt-0.5 text-[10px] font-medium text-teal-100/90">
                    (Access: Software Team Only)
                  </div>
                </button>
              </div>

              {/* Middle: Business Head */}
              <div className="flex flex-col items-center">
                <div className="h-5 w-px bg-slate-400" />
                <button
                  type="button"
                  onClick={() => bhUser && onSelectPerson(bhUser)}
                  className={`w-full rounded-lg bg-[#581C87] px-2.5 py-2.5 text-center text-white shadow-md transition hover:scale-[1.02] ${
                    selectedId === bhUser?.id ? 'ring-2 ring-amber-400 ring-offset-2' : ''
                  }`}
                >
                  <div className="text-xs sm:text-sm font-bold leading-tight">
                    {bhUser ? chartDisplayName(bhUser) : 'Sharadha Patil'}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-purple-200">Business Head</div>
                  <div className="mt-0.5 text-[10px] font-medium text-purple-200/90">
                    (Access: PM + 5 Teams)
                  </div>
                </button>
              </div>

              {/* Right: Engineering Director */}
              <div className="flex flex-col items-center">
                <div className="h-5 w-px bg-slate-400" />
                <button
                  type="button"
                  onClick={() => edUser && onSelectPerson(edUser)}
                  className={`w-full rounded-lg bg-[#1E3A8A] px-2.5 py-2.5 text-center text-white shadow-md transition hover:scale-[1.02] ${
                    selectedId === edUser?.id ? 'ring-2 ring-amber-400 ring-offset-2' : ''
                  }`}
                >
                  <div className="text-xs sm:text-sm font-bold leading-tight">
                    {edUser ? chartDisplayName(edUser) : 'Sabarigiri'}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-blue-200">
                    Engineering Director
                  </div>
                  <div className="mt-0.5 text-[10px] font-medium text-blue-200/90">
                    (Access: PM + 5 Teams)
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Level 3: Project Manager under Business Head */}
          <div className="flex flex-col items-center">
            <div className="h-6 w-px bg-slate-400" />
            <button
              type="button"
              onClick={() => pmUser && onSelectPerson(pmUser)}
              className={`w-56 rounded-lg bg-[#0B1F3A] px-3 py-2.5 text-center text-white shadow-md transition hover:scale-[1.02] ${
                selectedId === pmUser?.id ? 'ring-2 ring-amber-400 ring-offset-2' : ''
              }`}
            >
              <div className="text-xs sm:text-sm font-bold leading-tight">
                {pmUser ? chartDisplayName(pmUser) : 'Arivan'}
              </div>
              <div className="mt-0.5 text-[11px] font-semibold text-slate-200">Project Manager</div>
              <div className="mt-0.5 text-[10px] font-medium text-slate-300">(Access: 5 Teams)</div>
            </button>
          </div>

          {/* Stem down from PM to 5 Teams Connector */}
          <div className="h-6 w-px bg-slate-400" />

          {/* Level 4: 5 Team Cards */}
          <div className="w-full max-w-[900px]">
            {/* Horizontal Line connecting 5 column centers (10% to 90%) */}
            <div className="relative w-full">
              <div className="absolute left-[10%] right-[10%] top-0 h-px bg-slate-400" />
            </div>

            <div className="grid grid-cols-5 gap-2.5 sm:gap-3.5">
              {teamList.map((item, index) => (
                <div key={index} className="flex min-w-0 flex-col items-center">
                  {/* Stem & Downward Arrow */}
                  <div className="flex flex-col items-center">
                    <div className="h-4 w-px bg-slate-400" />
                    <svg
                      className="-mt-1 mb-1 h-3.5 w-3.5 text-slate-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>

                  <button
                    type="button"
                    onClick={() => item.team && onSelectTeam(item.team)}
                    className={`flex w-full flex-col overflow-hidden rounded-lg border border-slate-200 shadow-sm transition hover:scale-[1.02] hover:shadow-md ${
                      selectedId === item.team?.id ? 'ring-2 ring-amber-400 ring-offset-2' : ''
                    }`}
                  >
                    {/* Top Colored Part */}
                    <div
                      className={`flex min-h-[82px] flex-col items-center justify-center p-2 text-white ${item.bgClass}`}
                    >
                      <div className="mb-1 flex h-7 w-7 items-center justify-center rounded-md bg-white/15">
                        {item.icon}
                      </div>
                      <div className="text-center text-[10px] sm:text-[11px] font-bold leading-tight drop-shadow-sm">
                        {item.title}
                      </div>
                    </div>
                    {/* White Footer Strip */}
                    <div className="border-t border-slate-200 bg-white py-1.5 px-1 text-center">
                      <span className="text-[9px] sm:text-[10px] font-semibold text-slate-700">
                        Team Lead / Members
                      </span>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom ACCESS SUMMARY Container */}
          <div className="mt-8 w-full max-w-[900px] rounded-lg border border-dashed border-slate-400 bg-slate-50/50 p-4 text-slate-800">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B1F3A]">
              ACCESS SUMMARY
            </div>
            <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5 text-[11px] font-medium leading-snug text-slate-700">
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-slate-900">•</span>
                  <span>
                    <strong className="font-bold text-slate-900">CEO</strong> - Monitor All Dashboards
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-slate-900">•</span>
                  <span>
                    <strong className="font-bold text-slate-900">CTO</strong> - Monitor Software Team Only
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-slate-900">•</span>
                  <span>
                    <strong className="font-bold text-slate-900">Business Head &amp; Engineering Director</strong> - Monitor PM + 5 Teams
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-slate-900">•</span>
                  <span>
                    <strong className="font-bold text-slate-900">Project Manager</strong> - Monitor &amp; Manage 5 Teams
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

