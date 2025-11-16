"use client"

import React, { ReactNode, useState } from 'react'
import { Image, BarChart3 } from 'lucide-react'

interface RightSideTabsProps {
  keywordAnalysisContent: ReactNode
  imageGalleryContent?: ReactNode
}

const RightSideTabs: React.FC<RightSideTabsProps> = ({ 
  keywordAnalysisContent,
  imageGalleryContent
}) => {
  const [activeTab, setActiveTab] = useState<'image-gallery' | 'keyword-analysis'>('image-gallery')

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Tab Navigation - Professional Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200">
        <nav className="flex" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('image-gallery')}
            className={`flex-1 flex items-center justify-center px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'image-gallery'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Image className="w-4 h-4 mr-2" />
            Image Gallery
          </button>
          <button
            onClick={() => setActiveTab('keyword-analysis')}
            className={`flex-1 flex items-center justify-center px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'keyword-analysis'
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Keyword Analysis
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden bg-gray-50">
        {activeTab === 'image-gallery' ? (
          <div className="h-full overflow-y-auto">
            {imageGalleryContent || (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                    <Image className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Image Gallery</h3>
                  <p className="text-sm text-gray-500">Image gallery feature coming soon</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full overflow-hidden">
            {keywordAnalysisContent}
          </div>
        )}
      </div>
    </div>
  )
}

export default RightSideTabs
