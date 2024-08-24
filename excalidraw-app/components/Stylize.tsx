
function encodeURIForFileName(input: string): string {
    // First, encode the string as a URI component
    let encoded = encodeURIComponent(input);
    
    // Replace certain characters that are safe in URIs but not in filenames
    encoded = encoded.replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16));
    
    // Replace spaces with hyphens for better readability
    encoded = encoded.replace(/%20/g, '-');
    
    // Remove any remaining non-alphanumeric characters (except hyphens and underscores)
    encoded = encoded.replace(/[^a-zA-Z0-9-_]/g, '');
    
    // Trim hyphens from the beginning and end
    encoded = encoded.replace(/^-+|-+$/g, '');
    
    // Ensure the filename is not empty
    if (encoded.length === 0) {
    encoded = 'untitled';
    }
    
    return encoded;
}

export const makeAIStyleTransferImage = async (imageBlob: Blob, prompt: string): Promise<any> => {
  const serverNames = ['image', 'images2'];
  const maxRetries = 3;
  let lastError;

  for (let retry = 0; retry < maxRetries; retry++) {
    const serverName = serverNames[Math.floor(Math.random() * serverNames.length)];
    
    const name = encodeURIForFileName(prompt);

    const formData = new FormData();
    formData.append('image_file', imageBlob, 'image.webp');
    formData.append('prompt', prompt);
    formData.append('save_path', `ai/${name}.webp`);
    formData.append('canny', 'true');
    // strength is always .6

    try {
      const response = await fetch(`https://${serverName}.netwrck.com/style_transfer_bytes_and_upload_image`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error(`Attempt ${retry + 1} failed:`, error);
      lastError = error;
      
      if (retry === maxRetries - 1) {
        console.error('All retries failed');
        throw lastError;
      }
    }
  }
};


export default makeAIStyleTransferImage;

