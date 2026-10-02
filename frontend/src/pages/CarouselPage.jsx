import { useState, useEffect } from 'react';
import { PageHeader, Card } from '../components/ui';
import { api } from '../lib/api';
import Swal from 'sweetalert2';
import { FiTrash2, FiPlus, FiImage } from 'react-icons/fi';

export default function CarouselPage() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadImages = async () => {
    setLoading(true);
    try {
      const data = await api.carouselImages.getAll();
      setImages(data || []);
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Failed to load carousel images', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadImages();
  }, []);

  const handleFileChange = async (e) => {
    if (images.length >= 10) {
      Swal.fire('Limit Reached', 'Maximum limit of 10 carousel images reached. Please delete an image first.', 'warning');
      e.target.value = '';
      return;
    }

    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);
    formData.append('order', images.length + 1);
    
    setUploading(true);
    try {
      await api.carouselImages.create(formData);
      await loadImages();
      Swal.fire({
        icon: 'success',
        title: 'Image Added',
        toast: true,
        position: 'bottom-end',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'Failed to upload image', 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (id) => {
    const res = await Swal.fire({
      title: 'Are you sure?',
      text: "This image will be removed from the carousel.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete it',
    });

    if (res.isConfirmed) {
      try {
        await api.carouselImages.delete(id);
        setImages(images.filter(img => img.id !== id));
        Swal.fire({
          icon: 'success',
          title: 'Deleted!',
          toast: true,
          position: 'bottom-end',
          showConfirmButton: false,
          timer: 3000
        });
      } catch (err) {
        console.error(err);
        Swal.fire('Error', 'Failed to delete image', 'error');
      }
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Carousel Management" 
        subtitle="Manage images displayed on the customer dashboard carousel"
      />

      <Card className="p-5 border border-border">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-foreground">Carousel Images</h2>
          <label className="cursor-pointer">
            <input 
              type="file" 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange} 
              disabled={uploading}
            />
            <div className={`flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-bold transition-colors ${uploading ? 'opacity-50' : 'hover:bg-primary/90'}`}>
              <FiPlus className="w-4 h-4" />
              <span>{uploading ? 'Uploading...' : 'Add Image'}</span>
            </div>
          </label>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          </div>
        ) : images.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
            <FiImage className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No images in the carousel yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {images.map(img => (
              <div key={img.id} className="relative group rounded-2xl overflow-hidden border border-border aspect-video bg-muted/30">
                <img 
                  src={img.image_url} 
                  alt="Carousel" 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button 
                    onClick={() => handleDelete(img.id)}
                    className="p-3 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors"
                    title="Delete Image"
                  >
                    <FiTrash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
