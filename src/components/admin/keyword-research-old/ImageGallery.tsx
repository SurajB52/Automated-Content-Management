"use client"

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Star, Plus, Upload, Image as ImageIcon, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { getAdminUrl, adminFetch, ADMIN_API_CONFIG } from '@/config/adminApi'

interface ImageItem {
  id: number
  url: string
  alt: string
  created_at: string
}

interface ImageGalleryProps {
  onImageInsert?: (imageUrl: string) => void
  onSetFeaturedImage?: (imageUrl: string, altText: string) => void
  currentFeaturedImage?: string
}

const ImageGallery: React.FC<ImageGalleryProps> = ({
  onImageInsert,
  onSetFeaturedImage,
  currentFeaturedImage
}) => {
  const [images, setImages] = useState<ImageItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_totalImages, setTotalImages] = useState(0)
  const imagesPerPage = 15
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch images from backend
  const fetchImages = useCallback(async (page: number = 1) => {
    try {
      setIsLoading(true)
      
      const url = getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.gallery.list)
      const response = await adminFetch(`${url}?page=${page}&perPage=${imagesPerPage}`)
      const contentType = response.headers.get('content-type') || ''
      if (!response.ok) {
        const body = contentType.includes('application/json') ? await response.json().catch(() => ({})) : await response.text()
        console.error('Gallery list HTTP error', { status: response.status, body })
        toast.error(`Failed to load images (${response.status})`)
        return
      }
      const result = contentType.includes('application/json') ? await response.json() : null
      if (!result) {
        const text = await response.text()
        console.error('Gallery list non-JSON response', text?.slice(0, 200))
        toast.error('Failed to load images (unexpected response)')
        return
      }
      const isSuccess = result?.success === true || result?.status === 'success'
      if (isSuccess) {
        setImages(result.data?.images || [])
        setTotalImages(result.data?.pagination?.total || 0)
        setTotalPages(result.data?.pagination?.totalPages || 1)
      } else {
        console.error('Gallery list API error', result)
        toast.error(result.message || 'Failed to load images')
      }
    } catch (error) {
      console.error('Error fetching images:', error)
      toast.error('Failed to load images')
    } finally {
      setIsLoading(false)
    }
  }, [imagesPerPage])

  useEffect(() => {
    fetchImages(currentPage)
  }, [currentPage, fetchImages])

  // Handle file upload (supports multiple files)
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    // Validate all files
    const validFiles: File[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image file`)
        continue
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 5MB`)
        continue
      }
      
      validFiles.push(file)
    }
    
    if (validFiles.length === 0) return

    try {
      setIsUploading(true)
      
      const formData = new FormData()
      validFiles.forEach(file => {
        formData.append('files', file)
      })
      
      const url = getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.gallery.upload)
      const response = await adminFetch(url, {
        method: 'POST',
        body: formData,
      })
      const contentType = response.headers.get('content-type') || ''
      if (!response.ok) {
        const body = contentType.includes('application/json') ? await response.json().catch(() => ({})) : await response.text()
        console.error('Upload HTTP error', { status: response.status, body })
        toast.error(`Failed to upload images (${response.status})`)
        return
      }
      const result = contentType.includes('application/json') ? await response.json() : null
      if (!result) {
        const text = await response.text()
        console.error('Upload non-JSON response', text?.slice(0, 200))
        toast.error('Failed to upload images (unexpected response)')
        return
      }
      {
        const isSuccess = result?.success === true || result?.status === 'success'
        if (isSuccess) {
          toast.success(result.message || `${validFiles.length} image(s) uploaded successfully`)
          await fetchImages(currentPage)
        } else {
          console.error('Upload API error', result)
          toast.error(result.message || 'Failed to upload images')
        }
      }
      
    } catch (error) {
      console.error('Error uploading image:', error)
      toast.error('Failed to upload image')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const files = e.dataTransfer.files
    if (files.length === 0) return

    // Validate all files
    const validFiles: File[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image file`)
        continue
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 5MB`)
        continue
      }
      
      validFiles.push(file)
    }
    
    if (validFiles.length === 0) return

    try {
      setIsUploading(true)
      
      const formData = new FormData()
      validFiles.forEach(file => {
        formData.append('files', file)
      })
      
      const url = getAdminUrl(ADMIN_API_CONFIG.endpoints.blogManagement.gallery.upload)
      const response = await adminFetch(url, {
        method: 'POST',
        body: formData,
      })
      const contentType = response.headers.get('content-type') || ''
      if (!response.ok) {
        const body = contentType.includes('application/json') ? await response.json().catch(() => ({})) : await response.text()
        console.error('Upload (drop) HTTP error', { status: response.status, body })
        toast.error(`Failed to upload images (${response.status})`)
        return
      }
      const result = contentType.includes('application/json') ? await response.json() : null
      if (!result) {
        const text = await response.text()
        console.error('Upload (drop) non-JSON response', text?.slice(0, 200))
        toast.error('Failed to upload images (unexpected response)')
        return
      }
      if (result.status === 'success') {
        toast.success(result.message || `${validFiles.length} image(s) uploaded successfully`)
        await fetchImages(currentPage)
      } else {
        console.error('Upload (drop) API error', result)
        toast.error(result.message || 'Failed to upload images')
      }
      
    } catch (error) {
      console.error('Error uploading image:', error)
      toast.error('Failed to upload image')
    } finally {
      setIsUploading(false)
    }
  }

  // Handle insert image
  const handleInsertImage = (imageUrl: string) => {
    if (onImageInsert) {
      onImageInsert(imageUrl)
      toast.success('Image inserted into editor')
    }
  }

  // Handle set featured image
  const handleSetFeatured = (imageUrl: string, altText: string) => {
    if (onSetFeaturedImage) {
      onSetFeaturedImage(imageUrl, altText)
      toast.success('Featured image updated')
    }
  }

  // Pagination handlers
  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  const goToPage = (page: number) => {
    setCurrentPage(page)
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Upload Section */}
      <div className="flex-shrink-0 p-3 bg-white border-b border-gray-200">
        <div
          className="relative border-2 border-dashed border-gray-300 rounded-lg p-3 hover:border-blue-500 transition-colors cursor-pointer bg-gray-50"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {isUploading ? (
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              <span className="text-xs font-medium text-blue-600">Uploading...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center space-x-2">
              <Upload className="w-4 h-4 text-blue-600" />
              <div className="text-xs">
                <span className="font-medium text-blue-600">Click to upload</span>
                <span className="text-gray-500"> or drag and drop</span>
                <span className="text-gray-400 block mt-0.5">Multiple files supported</span>
              </div>
            </div>
          )}
        </div>
        <p className="mt-1.5 text-xs text-gray-500 text-center">PNG, JPG, GIF up to 5MB</p>
      </div>

      {/* Images Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-500">Loading images...</p>
            </div>
          </div>
        ) : images.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">No images yet</p>
              <p className="text-xs text-gray-500 mt-1">Upload your first image to get started</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {images.map((image) => (
              <div
                key={image.id}
                className="group relative bg-white rounded-md overflow-hidden border border-gray-200 hover:border-blue-400 hover:shadow-sm transition-all duration-150"
              >
                {/* Image */}
                <div className="aspect-video relative overflow-hidden bg-gray-100">
                  {(() => {
                    const servedUrl = getAdminUrl(`${ADMIN_API_CONFIG.endpoints.blogManagement.gallery.image}/${image.id}`)
                    return (
                      <img
                        src={servedUrl}
                        alt={image.alt}
                        className="w-full h-full object-cover"
                      />
                    )
                  })()}
                  
                  {/* Overlay with buttons - shows on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 via-gray-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-end justify-center pb-2 space-x-1.5">
                    {/* Insert Button */}
                    <button
                      onClick={() => {
                        const servedUrl = getAdminUrl(`${ADMIN_API_CONFIG.endpoints.blogManagement.gallery.image}/${image.id}`)
                        handleInsertImage(servedUrl)
                      }}
                      className="flex items-center justify-center w-8 h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-md transition-colors"
                      title="Insert into editor"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    
                    {/* Featured Image Button */}
                    <button
                      onClick={() => {
                        const servedUrl = getAdminUrl(`${ADMIN_API_CONFIG.endpoints.blogManagement.gallery.image}/${image.id}`)
                        handleSetFeatured(servedUrl, image.alt)
                      }}
                      className={`flex items-center justify-center w-8 h-8 ${
                        currentFeaturedImage === getAdminUrl(`${ADMIN_API_CONFIG.endpoints.blogManagement.gallery.image}/${image.id}`)
                          ? 'bg-yellow-500 hover:bg-yellow-600'
                          : 'bg-gray-700 hover:bg-gray-800'
                      } text-white rounded-md shadow-md transition-colors`}
                      title="Set as featured image"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          currentFeaturedImage === image.url ? 'fill-white' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {/* Featured Badge */}
                  {currentFeaturedImage === image.url && (
                    <div className="absolute top-1.5 right-1.5 bg-yellow-500 text-white text-xs font-semibold px-1.5 py-0.5 rounded shadow-sm flex items-center space-x-1">
                      <Star className="w-2.5 h-2.5 fill-white" />
                      <span>Featured</span>
                    </div>
                  )}
                </div>

                {/* Image Alt Text */}
                <div className="px-2 py-1.5 bg-white">
                  <p className="text-xs text-gray-600 truncate" title={image.alt}>
                    {image.alt || 'No description'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && images.length > 0 && (
        <div className="flex-shrink-0 p-3 bg-white border-t border-gray-200">
          <div className="flex items-center justify-between">
            {/* Info */}
            <div className="text-xs text-gray-600">
              Page {currentPage} of {totalPages}
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center space-x-2">
              {/* Previous Button */}
              <button
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
                className={`p-1.5 rounded ${
                  currentPage === 1
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-700 hover:bg-gray-100'
                } transition-colors`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Page Numbers */}
              <div className="flex space-x-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (currentPage <= 3) {
                    pageNum = i + 1
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = currentPage - 2 + i
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      className={`w-7 h-7 text-xs rounded ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-gray-700 hover:bg-gray-100'
                      } transition-colors`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
              </div>

              {/* Next Button */}
              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className={`p-1.5 rounded ${
                  currentPage === totalPages
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-700 hover:bg-gray-100'
                } transition-colors`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImageGallery
